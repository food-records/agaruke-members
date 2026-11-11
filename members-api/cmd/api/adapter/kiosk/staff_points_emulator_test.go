package kiosk

import (
	"bytes"
	"cloud.google.com/go/firestore"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"github.com/foodrecords/members-api/pkg/config"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestStaffOverrideFinalizeEmulator(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("isolated emulator required")
	}
	t.Setenv("MEMBERS_DATA_LAYOUT", "organization")
	t.Setenv("ORGANIZATION_UUID", "staff-finalize")
	ctx := context.Background()
	fs, e := firestore.NewClient(ctx, "demo-staff-finalize")
	if e != nil {
		t.Fatal(e)
	}
	defer fs.Close()
	h := handler{fs: fs}
	now := time.Now()
	put := func(ref *firestore.DocumentRef, value interface{}) {
		t.Helper()
		if _, e := ref.Set(ctx, value); e != nil {
			t.Fatal(e)
		}
	}
	member := config.DataCollection(fs, "members").Doc("member")
	put(member, map[string]interface{}{"number": 42, "point": 200, "total_earned_point": 0})
	for _, checkout := range []string{"checkout1", "checkout2"} {
		put(config.DataCollection(fs, "kiosk_coupon_reservations").Doc(checkout), reservationDoc{MemberID: "member", CheckoutID: checkout, Status: "reserved", CouponIDs: []string{}, CreatedAt: now, ExpiresAt: now.Add(time.Minute)})
	}
	key := fmt.Sprintf("%x", sha256.Sum256([]byte("kiosk:checkout1")))
	put(config.DataCollection(fs, "point_award_settings").Doc(key), map[string]interface{}{"member_id": "member", "amount": 300})
	finalize := func(checkout, order string) int {
		t.Helper()
		b, _ := json.Marshal(map[string]interface{}{"reservation_id": checkout, "order_uuid": order, "base_amount": 600, "points": 9999})
		r := httptest.NewRequest("POST", "/orders/finalize", bytes.NewReader(b))
		w := httptest.NewRecorder()
		h.FinalizeOrder(w, r)
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var data struct {
			Data struct {
				Awarded int `json:"awarded_points"`
			} `json:"data"`
		}
		if e := json.Unmarshal(w.Body.Bytes(), &data); e != nil {
			t.Fatal(e)
		}
		return data.Data.Awarded
	}
	if n := finalize("checkout1", "order1"); n != 300 {
		t.Fatal("server override", n)
	}
	if n := finalize("checkout1", "order1"); n != 300 {
		t.Fatal("retry result", n)
	}
	if n := finalize("checkout2", "order2"); n != 100 {
		t.Fatal("distinct order same day", n)
	}
	snapshot, e := member.Get(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if snapshot.Data()["point"] != int64(600) || snapshot.Data()["total_earned_point"] != int64(400) {
		t.Fatal("limited points entered total", snapshot.Data())
	}
}
