package shopify

import (
	"bytes"
	"cloud.google.com/go/firestore"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/foodrecords/members-api/pkg/config"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"
)

func emulator(t *testing.T) (handler, context.Context) {
	t.Helper()
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("Firestore emulator required")
	}
	t.Setenv("SHOPIFY_SHOP_DOMAIN", "members-test.myshopify.com")
	t.Setenv("MEMBERS_DATA_LAYOUT", "organization")
	t.Setenv("ORGANIZATION_UUID", fmt.Sprintf("shopify-%d", time.Now().UnixNano()))
	t.Setenv("SHOPIFY_LINK_LIFF_URL", "https://liff.line.me/test")
	t.Setenv("SHOPIFY_WEBHOOK_SECRET", "test-secret")
	t.Setenv("SHOPIFY_MEMBERS_ENABLED", "true")
	fs, e := firestore.NewClient(context.Background(), "demo-shopify-members")
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { fs.Close() })
	return handler{fs: fs}, context.Background()
}
func action(t *testing.T, h handler, body map[string]any, want int) map[string]any {
	t.Helper()
	raw, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	h.CustomerAction(w, httptest.NewRequest("POST", "/", bytes.NewReader(raw)))
	if w.Code != want {
		t.Fatalf("action %v: status %d body %s", body["action"], w.Code, w.Body.String())
	}
	var result struct {
		Data map[string]any `json:"data"`
	}
	if e := json.Unmarshal(w.Body.Bytes(), &result); e != nil {
		t.Fatal(e)
	}
	return result.Data
}
func TestDirectEntryFlowEmulator(t *testing.T) {
	h, ctx := emulator(t)
	member := config.DataCollection(h.fs, "members").Doc("line-test-user")
	if _, e := member.Set(ctx, map[string]any{"point": 1000, "total_earned_point": 1000, "number": 42}); e != nil {
		t.Fatal(e)
	}
	if data := action(t, h, map[string]any{"action": "status", "customer": "123"}, 200); data["linked"] != false {
		t.Fatal(data)
	}
	start := action(t, h, map[string]any{"action": "start", "customer": "123"}, 200)
	token := start["token"].(string)
	action(t, h, map[string]any{"action": "intent", "customer": "456", "token": token}, 400)
	action(t, h, map[string]any{"action": "confirm", "customer": "123", "token": token}, 200)
	if _, e := linkRef(h.fs, "123").Get(ctx); e == nil {
		t.Fatal("linked without LINE consent")
	}
	line := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/oauth2/v2.1/verify" {
			fmt.Fprint(w, `{"client_id":"test-channel","expires_in":3600}`)
		} else {
			fmt.Fprint(w, `{"userId":"line-test-user"}`)
		}
	}))
	defer line.Close()
	t.Setenv("LINE_API_BASE_URL", line.URL)
	t.Setenv("LINE_LOGIN_CHANNEL_ID", "test-channel")
	confirmation := ""
	propose := func(consent bool, want int) {
		body, _ := json.Marshal(map[string]any{"token": token, "consent": consent})
		r := httptest.NewRequest("POST", "/", bytes.NewReader(body))
		r.Header.Set("Authorization", "Bearer test-line-access")
		w := httptest.NewRecorder()
		h.ProposeLink(w, r)
		if w.Code == 200 {
			var response struct {
				Data struct {
					Code string `json:"confirmation_code"`
				} `json:"data"`
			}
			json.Unmarshal(w.Body.Bytes(), &response)
			confirmation = response.Data.Code
		}
		if w.Code != want {
			t.Fatalf("propose: %d %s", w.Code, w.Body.String())
		}
	}
	propose(false, 400)
	propose(true, 200)
	action(t, h, map[string]any{"action": "confirm", "customer": "123", "token": token}, 400) // Polling the intent cannot recover the LINE-only confirmation code.
	candidate := action(t, h, map[string]any{"action": "intent", "customer": "123", "token": token}, 200)
	if candidate["member_number"] != float64(42) {
		t.Fatal(candidate)
	}
	action(t, h, map[string]any{"action": "confirm", "customer": "123", "token": token, "confirmation_code": confirmation}, 200)
	action(t, h, map[string]any{"action": "confirm", "customer": "123", "token": token}, 400)
	other := action(t, h, map[string]any{"action": "start", "customer": "456"}, 200)
	token = other["token"].(string)
	propose(true, 200)
	action(t, h, map[string]any{"action": "confirm", "customer": "456", "token": token, "confirmation_code": confirmation}, 400)
	var wg sync.WaitGroup
	responses := make([]*httptest.ResponseRecorder, 2)
	for i := range responses {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			raw := []byte(`{"action":"exchange","customer":"123","cost":200,"request_id":"same-request-00001"}`)
			responses[i] = httptest.NewRecorder()
			h.CustomerAction(responses[i], httptest.NewRequest("POST", "/", bytes.NewReader(raw)))
		}(i)
	}
	wg.Wait()
	for _, w := range responses {
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	data := action(t, h, map[string]any{"action": "status", "customer": "123"}, 200)
	coupons := data["coupons"].([]any)
	if len(coupons) != 1 || data["point"] != float64(800) {
		t.Fatal(data)
	}
	coupon := coupons[0].(map[string]any)
	code := coupon["code"].(string)
	action(t, h, map[string]any{"action": "exchange", "customer": "123", "cost": 500, "request_id": "same-request-00001"}, 400)
	action(t, h, map[string]any{"action": "exchange", "customer": "123", "cost": 1000, "request_id": "insufficient-00001"}, 400)
	action(t, h, map[string]any{"action": "activate", "customer": "123", "code": code, "discount_id": "gid://shopify/DiscountCodeNode/99"}, 200)
	var order paidOrder
	json.Unmarshal([]byte(fmt.Sprintf(`{"id":987,"currency":"JPY","subtotal_price":"4000","discount_codes":[{"code":%q}]}`, code)), &order)
	var awards [2]int
	var errs [2]error
	for i := range awards {
		wg.Add(1)
		go func(i int) { defer wg.Done(); awards[i], errs[i] = h.applyPaidOrder(ctx, order, "123", time.Now()) }(i)
	}
	wg.Wait()
	for _, e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	if awards[0]+awards[1] != 100 {
		t.Fatal(awards)
	}
	ms, _ := member.Get(ctx)
	if ms.Data()["point"] != int64(900) || ms.Data()["total_earned_point"] != int64(1100) {
		t.Fatal(ms.Data())
	}
	cs, _ := ecRef(h.fs, code).Get(ctx)
	if cs.Data()["status"] != "used" {
		t.Fatal(cs.Data())
	}
	for i := 0; i < 2; i++ {
		if e := h.reverseOrder(ctx, "987", "123", []string{code}, time.Now()); e != nil {
			t.Fatal(e)
		}
	}
	ms, _ = member.Get(ctx)
	if ms.Data()["point"] != int64(800) || ms.Data()["total_earned_point"] != int64(1100) {
		t.Fatal(ms.Data())
	}
	if n, e := h.applyPaidOrder(ctx, order, "123", time.Now()); e != nil || n != 0 {
		t.Fatal(n, e)
	}
	if e := h.reverseOrder(ctx, "988", "123", nil, time.Now()); e != nil {
		t.Fatal(e)
	}
	order.ID = json.RawMessage(`988`)
	order.DiscountCodes = nil
	if n, e := h.applyPaidOrder(ctx, order, "123", time.Now()); e != nil || n != 0 {
		t.Fatal(n, e)
	}
}
func TestPaidWebhookAuthenticationEmulator(t *testing.T) {
	h, ctx := emulator(t)
	m := config.DataCollection(h.fs, "members").Doc("buyer")
	m.Set(ctx, map[string]any{"point": 0, "total_earned_point": 0})
	linkRef(h.fs, "123").Set(ctx, customerLinkDoc{LineUserID: "buyer", ShopifyCustomer: "123"})
	for _, tc := range []struct {
		name, body, shop, signature string
		status, award               int
	}{
		{"forged", `{"id":11}`, configuredShop(), "wrong", 403, 0},
		{"wrong-shop", `{"id":11}`, "foreign.myshopify.com", "valid", 403, 0},
		{"unpaid", `{"id":11,"financial_status":"pending","total_price":"1000","currency":"JPY","customer":{"id":123}}`, configuredShop(), "valid", 200, 0},
		{"zero", `{"id":11,"financial_status":"paid","total_price":"0","currency":"JPY","customer":{"id":123}}`, configuredShop(), "valid", 200, 0},
		{"test", `{"id":11,"financial_status":"paid","total_price":"1000","currency":"JPY","test":true,"customer":{"id":123}}`, configuredShop(), "valid", 200, 0},
		{"foreign-currency", `{"id":11,"financial_status":"paid","total_price":"1000","currency":"USD","customer":{"id":123}}`, configuredShop(), "valid", 200, 0},
		{"paid", `{"id":11,"financial_status":"paid","total_price":"1000","currency":"JPY","customer":{"id":"gid://shopify/Customer/123"}}`, configuredShop(), "valid", 200, 100},
		{"retry", `{"id":11,"financial_status":"paid","total_price":"1000","currency":"JPY","customer":{"id":123}}`, configuredShop(), "valid", 200, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/", bytes.NewBufferString(tc.body))
			r.Header.Set("X-Shopify-Shop-Domain", tc.shop)
			r.Header.Set("X-Shopify-Topic", "orders/paid")
			signature := tc.signature
			if signature == "valid" {
				mac := hmac.New(sha256.New, []byte("test-secret"))
				mac.Write([]byte(tc.body))
				signature = base64.StdEncoding.EncodeToString(mac.Sum(nil))
			}
			r.Header.Set("X-Shopify-Hmac-Sha256", signature)
			w := httptest.NewRecorder()
			h.OrdersPaid(w, r)
			if w.Code != tc.status {
				t.Fatal(w.Code, w.Body.String())
			}
			if tc.status == 200 {
				var data struct {
					Data struct {
						Award int `json:"awarded_points"`
					} `json:"data"`
				}
				json.Unmarshal(w.Body.Bytes(), &data)
				if data.Data.Award != tc.award {
					t.Fatal(w.Body.String())
				}
			}
		})
	}
	other := config.DataCollection(h.fs, "members").Doc("other")
	other.Set(ctx, map[string]any{"point": 0})
	linkRef(h.fs, "123").Set(ctx, customerLinkDoc{LineUserID: "other", ShopifyCustomer: "123"})
	if n, e := h.applyPaidOrder(ctx, paidOrder{ID: json.RawMessage(`11`)}, "123", time.Now()); e != nil || n != 0 {
		t.Fatal(n, e)
	}
	snap, _ := other.Get(ctx)
	if snap.Data()["point"] != int64(0) {
		t.Fatal(snap.Data())
	}
}
func TestDisabledAndServiceBoundary(t *testing.T) {
	t.Setenv("SHOPIFY_MEMBERS_ENABLED", "")
	w := httptest.NewRecorder()
	NewRouter().ServeHTTP(w, httptest.NewRequest("POST", "/customer/action", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
	t.Setenv("SHOPIFY_MEMBERS_ENABLED", "true")
	t.Setenv("MEMBERS_SERVICE_KEY", "private-test-key")
	w = httptest.NewRecorder()
	NewRouter().ServeHTTP(w, httptest.NewRequest("POST", "/customer/action", nil))
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
}

func TestConfirmationExpiryAndAttemptLimitEmulator(t *testing.T) {
	h, ctx := emulator(t)
	member := config.DataCollection(h.fs, "members").Doc("card")
	member.Set(ctx, map[string]any{"point": 0, "number": 1})
	token := "local-test-intent"
	intent := config.DataCollection(h.fs, "shopify_link_intents").Doc(tokenHash(token))
	intent.Set(ctx, linkIntent{Customer: "123", Candidate: "card", ExpiresAt: time.Now().Add(time.Minute), ConfirmationHash: tokenHash("1234ABCD")})
	for i := 0; i < 5; i++ {
		action(t, h, map[string]any{"action": "confirm", "customer": "123", "token": token, "confirmation_code": "wrong"}, 400)
	}
	action(t, h, map[string]any{"action": "confirm", "customer": "123", "token": token, "confirmation_code": "1234ABCD"}, 400)
	if _, e := linkRef(h.fs, "123").Get(ctx); e == nil {
		t.Fatal("locked intent linked")
	}
	intent.Set(ctx, linkIntent{Customer: "123", Candidate: "card", ExpiresAt: time.Now().Add(-time.Minute), ConfirmationHash: tokenHash("1234ABCD")})
	action(t, h, map[string]any{"action": "confirm", "customer": "123", "token": token, "confirmation_code": "1234ABCD"}, 400)
}
