package shopify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/foodrecords/members-api/pkg/config"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestLIFFTicketsEmulator(t *testing.T) {
	h, ctx := emulator(t)
	t.Setenv("SHOPIFY_LINK_TEST_ONLY", "false")
	t.Setenv("LINE_LOGIN_CHANNEL_ID", "liff-test")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/oauth2/v2.1/verify" {
			if r.URL.Query().Get("access_token") == "invalid" {
				w.WriteHeader(401)
				return
			}
			fmt.Fprint(w, `{"client_id":"liff-test","expires_in":300}`)
			return
		}
		fmt.Fprintf(w, `{"userId":%q}`, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	}))
	defer server.Close()
	t.Setenv("LINE_API_BASE_URL", server.URL)
	for _, uid := range []string{"alice", "bob"} {
		if _, e := config.DataCollection(h.fs, "members").Doc(uid).Set(ctx, map[string]any{"point": 2000, "number": 42}); e != nil {
			t.Fatal(e)
		}
	}
	call := func(uid string, b map[string]any) (int, map[string]any) {
		raw, _ := json.Marshal(b)
		r := httptest.NewRequest("POST", "/", bytes.NewReader(raw))
		r.Header.Set("Authorization", "Bearer "+uid)
		w := httptest.NewRecorder()
		h.LIFFAction(w, r)
		var out struct {
			Data map[string]any `json:"data"`
		}
		json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out.Data
	}
	if status, _ := call("invalid", map[string]any{"action": "status"}); status != 403 {
		t.Fatal(status)
	}
	if status, _ := call("missing", map[string]any{"action": "status"}); status != 403 {
		t.Fatal(status)
	}
	id := strings.Repeat("a", 32)
	var wg sync.WaitGroup
	results := make(chan map[string]any, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			status, data := call("alice", map[string]any{"action": "exchange", "cost": 200, "request_id": id, "customer": "999", "uid": "bob"})
			if status != 200 {
				t.Errorf("exchange %d", status)
			}
			results <- data
		}()
	}
	wg.Wait()
	close(results)
	var coupon map[string]any
	for data := range results {
		c := data["coupon"].(map[string]any)
		if coupon != nil && coupon["id"] != c["id"] {
			t.Fatal("duplicate coupon")
		}
		coupon = c
	}
	_, state := call("alice", map[string]any{"action": "status"})
	if state["point"] != float64(1800) || len(state["coupons"].([]any)) != 1 {
		t.Fatal("deducted twice")
	}
	_, bob := call("bob", map[string]any{"action": "status"})
	if len(bob["coupons"].([]any)) != 0 {
		t.Fatal("cross-member leak")
	}
	if status, _ := call("bob", map[string]any{"action": "activate", "code": coupon["code"], "discount_id": "gid://shopify/DiscountCodeNode/1"}); status != 400 {
		t.Fatal("cross-member activation")
	}
	if status, _ := call("alice", map[string]any{"action": "activate", "code": coupon["code"], "discount_id": "gid://shopify/DiscountCodeNode/1"}); status != 200 {
		t.Fatal("activation", status)
	}
	// Paid webhook consumption works without a Shopify login or cart session.
	var order paidOrder
	rawOrder, _ := json.Marshal(map[string]any{"id": 901, "discount_codes": []map[string]string{{"code": coupon["code"].(string)}}})
	json.Unmarshal(rawOrder, &order)
	for i := 0; i < 2; i++ {
		if e := h.consumeBearerCoupons(ctx, order); e != nil {
			t.Fatal(e)
		}
	}
	_, state = call("alice", map[string]any{"action": "status"})
	if state["point"] != float64(1800) || state["coupons"].([]any)[0].(map[string]any)["status"] != "used" {
		t.Fatal("consumption changed points or failed")
	}
	for i, cost := range []int{500, 1000} {
		status, data := call("bob", map[string]any{"action": "exchange", "cost": cost, "request_id": strings.Repeat(fmt.Sprint(i), 32)})
		if status != 200 || data["coupon"].(map[string]any)["minimum"] != float64(ecTiers[cost]) {
			t.Fatal("tier", cost, status)
		}
	}
	if status, _ := call("bob", map[string]any{"action": "exchange", "cost": 1000, "request_id": strings.Repeat("z", 32)}); status != 400 {
		t.Fatal("insufficient points")
	}
	// Include existing Shopify-issued and used/expired tickets without rewriting them.
	ref := config.DataCollection(h.fs, "members").Doc("alice").Collection("shopify_coupons")
	_, e := ref.Doc("old").Set(ctx, ecCoupon{ID: "old", Code: "TESTOLD", UID: "alice", Customer: "123", Cost: 500, Minimum: 7000, Status: "used", ExpiresAt: time.Now().Add(-time.Hour)})
	if e != nil {
		t.Fatal(e)
	}
	_, state = call("alice", map[string]any{"action": "status"})
	if len(state["coupons"].([]any)) != 2 {
		t.Fatal("old ticket missing")
	}
	if status, _ := call("alice", map[string]any{"action": "exchange", "cost": 300, "request_id": strings.Repeat("b", 32)}); status != 400 {
		t.Fatal("invalid tier")
	}
	_, _ = config.DataCollection(h.fs, "members").Doc("alice").Set(ctx, map[string]any{"deleted_at": time.Now()})
	if status, _ := call("alice", map[string]any{"action": "status"}); status != 403 {
		t.Fatal("deleted member")
	}
}

func TestLIFFRouteRequiresServiceKey(t *testing.T) {
	t.Setenv("SHOPIFY_MEMBERS_ENABLED", "true")
	t.Setenv("MEMBERS_SERVICE_KEY", "synthetic-service")
	r := httptest.NewRequest("POST", "/liff/action", strings.NewReader(`{"action":"status"}`))
	r.Header.Set("Authorization", "Bearer synthetic")
	w := httptest.NewRecorder()
	NewRouter().ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("missing service key", w.Code)
	}
}
