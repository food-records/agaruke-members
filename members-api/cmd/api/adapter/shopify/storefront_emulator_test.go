package shopify

import (
	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"testing"
	"time"
)

func TestStorefrontMembershipAndResumeEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, uid := purchaseFixture(t, h, ctx)
	state := purchaseAction(t, h, map[string]any{"action": "storefront_status", "cart": "cart-original", "token": token}, 200)
	if state["linked"] != true || state["ready"] != true || state["permanent"] != false {
		t.Fatal(state)
	}
	state = purchaseAction(t, h, map[string]any{"action": "storefront_status", "cart": "another-cart", "token": token}, 200)
	if state["linked"] != false {
		t.Fatal("cart mismatch accepted")
	}
	purchaseAction(t, h, map[string]any{"action": "bind", "token": token, "cart": "cart-original", "customer": "123"}, 200)
	state = purchaseAction(t, h, map[string]any{"action": "storefront_status", "cart": "cart-original", "token": token, "customer": "456"}, 200)
	if state["linked"] != false {
		t.Fatal("another authenticated account saw previous member")
	}
	state = purchaseAction(t, h, map[string]any{"action": "storefront_status", "cart": "next-cart", "customer": "123"}, 200)
	if state["linked"] != true || state["ready"] != false || state["token"] != "" {
		t.Fatal(state)
	}
	state = purchaseAction(t, h, map[string]any{"action": "storefront_status", "cart": "next-cart", "customer": "123", "resume": true}, 200)
	next := state["token"].(string)
	if len(next) != 64 || state["ready"] != true {
		t.Fatal("cannot resume authenticated link")
	}
	state = purchaseAction(t, h, map[string]any{"action": "storefront_status", "cart": "next-cart", "customer": "123", "token": next, "resume": true}, 200)
	if state["token"] != "" || state["ready"] != true {
		t.Fatal("valid session unnecessarily recreated")
	}
	_, e := purchaseRef(h.fs, next).Update(ctx, []firestore.Update{{Path: "expires_at", Value: time.Now().Add(-time.Minute)}})
	if e != nil {
		t.Fatal(e)
	}
	state = purchaseAction(t, h, map[string]any{"action": "storefront_status", "cart": "next-cart", "token": next}, 200)
	if state["linked"] != false {
		t.Fatal("expired guest session accepted")
	}
	_, e = config.DataCollection(h.fs, "members").Doc(uid).Update(ctx, []firestore.Update{{Path: "deleted_at", Value: time.Now()}})
	if e != nil {
		t.Fatal(e)
	}
	state = purchaseAction(t, h, map[string]any{"action": "storefront_status", "cart": "next-cart", "customer": "123", "resume": true}, 200)
	if state["linked"] != false {
		t.Fatal("deleted member resumed")
	}
}
