package shopify

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/foodrecords/members-api/pkg/config"
)

func purchaseAction(t *testing.T, h handler, b map[string]any, want int) map[string]any {
	t.Helper()
	raw, _ := json.Marshal(b)
	w := httptest.NewRecorder()
	h.PurchaseAction(w, httptest.NewRequest("POST", "/", bytes.NewReader(raw)))
	if w.Code != want {
		t.Fatalf("purchase %s status=%d body=%s", b["action"], w.Code, w.Body.String())
	}
	var result struct {
		Data map[string]any `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	return result.Data
}
func purchaseFixture(t *testing.T, h handler, ctx context.Context) (string, string) {
	t.Helper()
	uid := "line-purchase-user"
	_, e := config.DataCollection(h.fs, "members").Doc(uid).Set(ctx, map[string]any{"point": 1000, "total_earned_point": 1000, "number": 42})
	if e != nil {
		t.Fatal(e)
	}
	verifier := strings.Repeat("a", 64)
	start := purchaseAction(t, h, map[string]any{"action": "start", "challenge": tokenHash(verifier)}, 200)
	grant := start["token"].(string)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/oauth2/v2.1/verify" {
			fmt.Fprint(w, `{"client_id":"test-channel","expires_in":3600}`)
		} else {
			fmt.Fprintf(w, `{"userId":%q}`, uid)
		}
	}))
	t.Cleanup(server.Close)
	t.Setenv("LINE_API_BASE_URL", server.URL)
	t.Setenv("LINE_LOGIN_CHANNEL_ID", "test-channel")
	raw, _ := json.Marshal(map[string]any{"token": grant, "consent": true})
	r := httptest.NewRequest("POST", "/", bytes.NewReader(raw))
	r.Header.Set("Authorization", "Bearer test-line-access")
	w := httptest.NewRecorder()
	h.PurchaseAuthorize(w, r)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var response struct {
		Data struct {
			Code string `json:"code"`
		} `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &response)
	purchaseAction(t, h, map[string]any{"action": "consume", "token": grant, "code": response.Data.Code, "verifier": strings.Repeat("b", 64), "cart": "cart-original"}, 400)
	data := purchaseAction(t, h, map[string]any{"action": "consume", "token": grant, "code": response.Data.Code, "verifier": verifier, "cart": "cart-original"}, 200)
	purchaseAction(t, h, map[string]any{"action": "consume", "token": grant, "code": response.Data.Code, "verifier": verifier, "cart": "cart-original"}, 400)
	return data["token"].(string), uid
}
func purchaseOrder(token, id, cart string) paidOrder {
	var order paidOrder
	json.Unmarshal([]byte(fmt.Sprintf(`{"id":%q,"customer":{"id":123},"created_at":%q,"cart_token":%q,"note_attributes":[{"name":"_agaruke_purchase","value":%q}],"currency":"JPY","total_price":"4000","subtotal_price":"4000","financial_status":"paid"}`, id, time.Now().UTC().Format(time.RFC3339Nano), cart, token)), &order)
	return order
}
func recordPurchaseOrder(t *testing.T, h handler, order paidOrder) {
	t.Helper()
	raw, _ := json.Marshal(order)
	// Test helper paidOrder fields are faithfully encoded by their JSON tags.
	r := httptest.NewRequest("POST", "/", bytes.NewReader(raw))
	r.Header.Set("X-Shopify-Shop-Domain", configuredShop())
	r.Header.Set("X-Shopify-Topic", "orders/create")
	r.Header.Set("X-Shopify-Hmac-Sha256", signatureForTest(raw))
	w := httptest.NewRecorder()
	h.OrdersCreated(w, r)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
}
func TestGuestPurchaseEmulator(t *testing.T) {
	h, ctx := emulator(t)
	t.Setenv("SHOPIFY_LINE_FIRST_ENABLED", "true")
	token, uid := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "status", "token": token, "cart": "wrong-cart"}, 400)
	state := purchaseAction(t, h, map[string]any{"action": "status", "token": token, "cart": "cart-original"}, 200)
	if state["permanent"] != false {
		t.Fatal(state)
	}
	c := purchaseAction(t, h, map[string]any{"action": "exchange", "token": token, "cart": "cart-original", "cost": 200, "request_id": "purchase-request-123"}, 200)["coupon"].(map[string]any)
	purchaseAction(t, h, map[string]any{"action": "activate", "token": token, "cart": "cart-original", "code": c["code"], "discount_id": "gid://shopify/DiscountCodeNode/1"}, 200)
	order := purchaseOrder(token, "7001", "cart-original")
	order.DiscountCodes = append(order.DiscountCodes, struct {
		Code string `json:"code"`
	}{c["code"].(string)})
	recordPurchaseOrder(t, h, order)
	wrong := purchaseOrder(token, "7002", "wrong-cart")
	if n, e := h.applyPaidOrder(ctx, wrong, "123", time.Now()); e != nil || n != 0 {
		t.Fatal(n, e)
	}
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := h.applyPaidOrder(ctx, order, "123", time.Now()); e != nil {
				t.Error(e)
			}
		}()
	}
	wg.Wait()
	if _, e := linkRef(h.fs, "123").Get(ctx); e == nil {
		t.Fatal("guest created permanent link")
	}
	m, _ := config.DataCollection(h.fs, "members").Doc(uid).Get(ctx)
	if m.Data()["point"] != int64(900) {
		t.Fatal(m.Data())
	}
	if n, e := h.applyPaidOrder(ctx, purchaseOrder(token, "7003", "cart-original"), "123", time.Now()); e != nil || n != 0 {
		t.Fatal("token reused", n, e)
	}
	purchaseAction(t, h, map[string]any{"action": "exchange", "token": token, "cart": "cart-original", "cost": 200, "request_id": "purchase-request-456"}, 400)
	if e := h.reverseOrder(ctx, "7001", "123", []string{c["code"].(string)}, time.Now()); e != nil {
		t.Fatal(e)
	}
	if e := h.reverseOrder(ctx, "7001", "123", []string{c["code"].(string)}, time.Now()); e != nil {
		t.Fatal(e)
	}
	m, _ = config.DataCollection(h.fs, "members").Doc(uid).Get(ctx)
	if m.Data()["point"] != int64(800) {
		t.Fatal(m.Data())
	}
}
func TestCheckoutLoginBindingEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, uid := purchaseFixture(t, h, ctx)
	order := purchaseOrder(token, "8001", "cart-original")
	purchaseAction(t, h, map[string]any{"action": "bind_order", "token": token, "customer": "123", "order_id": "8001"}, 400)
	recordPurchaseOrder(t, h, order)
	purchaseAction(t, h, map[string]any{"action": "bind_order", "token": token, "customer": "456", "order_id": "8001"}, 400)
	purchaseAction(t, h, map[string]any{"action": "bind_order", "token": token, "customer": "123", "order_id": "8001"}, 200)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": token, "cart": "cart-original", "customer": "456"}, 400)
	s, e := linkRef(h.fs, "123").Get(ctx)
	if e != nil || s.Data()["line_user_id"] != uid {
		t.Fatal(e)
	}
}
func TestPreCheckoutLoginBindingEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, _ := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": token, "cart": "cart-original", "customer": "123"}, 200)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": token, "cart": "cart-original", "customer": "123"}, 200)
	state := purchaseAction(t, h, map[string]any{"action": "status", "token": token, "cart": "cart-original"}, 200)
	if state["permanent"] != true {
		t.Fatal(state)
	}
}

func signatureForTest(raw []byte) string {
	m := hmac.New(sha256.New, []byte("test-secret"))
	m.Write(raw)
	return base64.StdEncoding.EncodeToString(m.Sum(nil))
}
