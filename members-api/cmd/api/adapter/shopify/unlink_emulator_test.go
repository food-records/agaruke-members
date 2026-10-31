package shopify

import (
	"cloud.google.com/go/firestore"
	"context"
	"github.com/foodrecords/members-api/pkg/config"
	"strings"
	"testing"
	"time"
)

func unlinkAction(t *testing.T, h handler, token, customer string, want int) {
	t.Helper()
	purchaseAction(t, h, map[string]any{"action": "unlink", "token": token, "customer": customer, "cart": "cart-original", "confirm": true}, want)
}
func TestGuestUnlinkEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, uid := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "unlink", "token": token, "cart": "wrong", "confirm": true}, 400)
	purchaseAction(t, h, map[string]any{"action": "unlink", "token": token, "cart": "cart-original"}, 400)
	unlinkAction(t, h, token, "", 200)
	unlinkAction(t, h, token, "", 200)
	purchaseAction(t, h, map[string]any{"action": "status", "token": token, "cart": "cart-original"}, 400)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": token, "cart": "cart-original", "customer": "123"}, 400)
	purchaseAction(t, h, map[string]any{"action": "exchange", "token": token, "cart": "cart-original", "cost": 200, "request_id": "unlink-replay-123456"}, 400)
	state := purchaseAction(t, h, map[string]any{"action": "storefront_status", "token": token, "cart": "cart-original"}, 200)
	if state["linked"] != false {
		t.Fatal(state)
	}
	m, _ := config.DataCollection(h.fs, "members").Doc(uid).Get(ctx)
	if m.Data()["point"] != int64(1000) {
		t.Fatal(m.Data())
	}
	fresh, _ := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "status", "token": fresh, "cart": "cart-original"}, 200)
}
func TestPermanentUnlinkRevokesOtherSessionsAndOldProofsEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, uid := purchaseFixture(t, h, ctx)
	second, _ := purchaseFixture(t, h, ctx)
	for _, value := range []string{token, second} {
		purchaseAction(t, h, map[string]any{"action": "bind", "token": value, "cart": "cart-original", "customer": "123"}, 200)
	}
	intentToken := strings.Repeat("c", 64)
	code := strings.Repeat("d", 64)
	verifier := strings.Repeat("e", 64)
	_, e := grantRef(h.fs, intentToken).Set(ctx, purchaseGrant{UID: uid, Challenge: tokenHash(verifier), CodeHash: tokenHash(code), ExpiresAt: time.Now().Add(10 * time.Minute)})
	if e != nil {
		t.Fatal(e)
	}
	legacy := strings.Repeat("f", 64)
	_, e = config.DataCollection(h.fs, "shopify_link_intents").Doc(tokenHash(legacy)).Set(ctx, linkIntent{Customer: "123", Candidate: uid, ConfirmationHash: tokenHash("ABCDEFGH"), ExpiresAt: time.Now().Add(linkSessionLifetime)})
	if e != nil {
		t.Fatal(e)
	}
	unlinkAction(t, h, token, "", 400)
	unlinkAction(t, h, token, "456", 400)
	unlinkAction(t, h, token, "123", 200)
	for _, ref := range []*firestore.DocumentRef{linkRef(h.fs, "123"), reverseRef(h.fs, uid)} {
		if s, e := ref.Get(ctx); e == nil && s.Exists() {
			t.Fatal("link survived")
		}
	}
	for _, value := range []string{token, second} {
		purchaseAction(t, h, map[string]any{"action": "status", "token": value, "cart": "cart-original"}, 400)
	}
	purchaseAction(t, h, map[string]any{"action": "bind", "token": second, "cart": "cart-original", "customer": "123"}, 400)
	purchaseAction(t, h, map[string]any{"action": "consume", "token": intentToken, "code": code, "verifier": verifier, "cart": "cart-original"}, 400)
	action(t, h, map[string]any{"action": "confirm", "customer": "123", "token": legacy, "confirmation_code": "ABCDEFGH"}, 400)
	state := purchaseAction(t, h, map[string]any{"action": "storefront_status", "customer": "123", "cart": "cart-original", "resume": true}, 200)
	if state["linked"] != false {
		t.Fatal(state)
	}
	oldOrder := purchaseOrder(second, "99001", "cart-original")
	fresh, _ := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": fresh, "cart": "cart-original", "customer": "123"}, 200)
	unlinkAction(t, h, token, "123", 200)
	if _, e := linkRef(h.fs, "123").Get(ctx); e != nil {
		t.Fatal("old retry removed a new link", e)
	}
	unlinkAction(t, h, fresh, "123", 200)
	if n, e := h.applyPaidOrder(ctx, oldOrder, "123", time.Now()); e != nil || n != 0 {
		t.Fatal("old generation order earned", n, e)
	}
	freshAgain, _ := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": freshAgain, "cart": "cart-original", "customer": "123"}, 200)
}
func TestUnlinkPreservesExistingOrderPointsRefundAndCouponsEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, uid := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": token, "cart": "cart-original", "customer": "123"}, 200)
	c := purchaseAction(t, h, map[string]any{"action": "exchange", "token": token, "cart": "cart-original", "cost": 200, "request_id": "unlink-existing-order"}, 200)["coupon"].(map[string]any)
	purchaseAction(t, h, map[string]any{"action": "activate", "token": token, "cart": "cart-original", "code": c["code"], "discount_id": "gid://shopify/DiscountCodeNode/77"}, 200)
	order := purchaseOrder(token, "99101", "cart-original")
	recordPurchaseOrder(t, h, order)
	unlinkAction(t, h, token, "123", 200)
	coupon, _ := ecRef(h.fs, c["code"].(string)).Get(ctx)
	if coupon.Data()["status"] != "available" {
		t.Fatal("unlink voided coupon")
	}
	for i := 0; i < 2; i++ {
		n, e := h.applyPaidOrder(ctx, order, "123", time.Now())
		if e != nil || (i == 0 && n != 100) || (i == 1 && n != 0) {
			t.Fatal(n, e)
		}
	}
	m, _ := config.DataCollection(h.fs, "members").Doc(uid).Get(ctx)
	if m.Data()["point"] != int64(900) {
		t.Fatal(m.Data())
	}
	for i := 0; i < 2; i++ {
		if e := h.reverseOrder(ctx, "99101", "123", nil, time.Now()); e != nil {
			t.Fatal(e)
		}
	}
	m, _ = config.DataCollection(h.fs, "members").Doc(uid).Get(ctx)
	if m.Data()["point"] != int64(800) {
		t.Fatal(m.Data())
	}
}
func TestUnlinkedSessionCannotCreateOrEarnNewOrderEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, _ := purchaseFixture(t, h, ctx)
	unlinkAction(t, h, token, "", 200)
	order := purchaseOrder(token, "99201", "cart-original")
	recordPurchaseOrder(t, h, order)
	if _, e := purchaseOrderRef(h.fs, "99201").Get(ctx); e == nil {
		t.Fatal("new order was reserved")
	}
	if n, e := h.applyPaidOrder(ctx, order, "123", time.Now()); e != nil || n != 0 {
		t.Fatal(n, e)
	}
}
func TestOlderUnrecordedOrderSurvivesUnlinkEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, _ := purchaseFixture(t, h, ctx)
	_, e := purchaseRef(h.fs, token).Update(ctx, []firestore.Update{{Path: "created_at", Value: time.Now().Add(-10 * time.Second)}})
	if e != nil {
		t.Fatal(e)
	}
	order := purchaseOrder(token, "99301", "cart-original")
	order.CreatedAt = time.Now().Add(-5 * time.Second)
	unlinkAction(t, h, token, "", 200)
	if n, e := h.applyPaidOrder(ctx, order, "123", time.Now()); e != nil || n != 100 {
		t.Fatal(n, e)
	}
}
func TestUnlinkDoesNotTouchAnotherMemberEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, _ := purchaseFixture(t, h, ctx)
	other := purchaseSession{UID: "another-user", CartHash: tokenHash("another-cart"), CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour)}
	ref := purchaseRef(h.fs, strings.Repeat("9", 64))
	if _, e := ref.Set(context.Background(), other); e != nil {
		t.Fatal(e)
	}
	unlinkAction(t, h, token, "", 200)
	snapshot, _ := ref.Get(ctx)
	var after purchaseSession
	snapshot.DataTo(&after)
	if !after.RevokedAt.IsZero() {
		t.Fatal(after)
	}
}

func TestAccountUnlinkWithoutPurchaseSessionAndStaleHintEmulator(t *testing.T) {
	h, ctx := emulator(t)
	token, _ := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": token, "cart": "cart-original", "customer": "123"}, 200)
	state := action(t, h, map[string]any{"action": "account_status", "customer": "123"}, 200)
	hint := state["unlink_hint"].(string)
	action(t, h, map[string]any{"action": "unlink", "customer": "123", "link_hint": hint}, 400)
	action(t, h, map[string]any{"action": "unlink", "customer": "123", "link_hint": strings.Repeat("0", 64), "confirm": true}, 400)
	action(t, h, map[string]any{"action": "unlink", "customer": "456", "link_hint": hint, "confirm": true}, 200)
	if _, e := linkRef(h.fs, "123").Get(ctx); e != nil {
		t.Fatal("wrong customer removed link", e)
	}
	action(t, h, map[string]any{"action": "unlink", "customer": "123", "link_hint": hint, "confirm": true}, 200)
	action(t, h, map[string]any{"action": "unlink", "customer": "123", "link_hint": hint, "confirm": true}, 200)
	purchaseAction(t, h, map[string]any{"action": "status", "token": token, "cart": "cart-original"}, 400)
	fresh, _ := purchaseFixture(t, h, ctx)
	purchaseAction(t, h, map[string]any{"action": "bind", "token": fresh, "cart": "cart-original", "customer": "123"}, 200)
	action(t, h, map[string]any{"action": "unlink", "customer": "123", "link_hint": hint, "confirm": true}, 400)
	if _, e := linkRef(h.fs, "123").Get(ctx); e != nil {
		t.Fatal("stale hint removed new link", e)
	}
}
