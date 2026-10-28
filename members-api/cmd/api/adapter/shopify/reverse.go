package shopify

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/presenter"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ReverseOrder is backend-only: the Shopify app verifies a refund/cancellation
// webhook and re-reads the authoritative order before requesting reversal.
func (h handler) ReverseOrder(w http.ResponseWriter, r *http.Request) {
	var b struct {
		OrderID  string   `json:"order_id"`
		Customer string   `json:"customer"`
		Codes    []string `json:"codes"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 16384)).Decode(&b) != nil || !numericID.MatchString(b.OrderID) || len(b.Codes) > 10 {
		presenter.BadRequest(w, "INVALID_REQUEST")
		return
	}
	if e := h.reverseOrder(r.Context(), b.OrderID, customerID(b.Customer), b.Codes, time.Now()); e != nil {
		presenter.Error(w, e)
		return
	}
	presenter.Success(w)
}
func (h handler) reverseOrder(ctx context.Context, id, customer string, discounts []string, now time.Time) error {
	ledger := config.DataCollection(h.fs, "shopify_orders").Doc(tokenHash(configuredShop() + ":" + id))
	return h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, e := tx.Get(ledger)
		exists := e == nil
		if e != nil && status.Code(e) != codes.NotFound {
			return e
		}
		var previous struct {
			Customer string                 `firestore:"customer"`
			Member   *firestore.DocumentRef `firestore:"member_ref"`
			Points   int                    `firestore:"awarded_points"`
			State    string                 `firestore:"webhook_state"`
		}
		if exists {
			if e = snap.DataTo(&previous); e != nil {
				return e
			}
			if previous.State == "reversed" {
				return nil
			}
		}
		if previous.Customer != "" {
			if customer != "" && customer != previous.Customer {
				return errors.New("CUSTOMER_ORDER_CONFLICT")
			}
			customer = previous.Customer
		}
		var member memberDoc
		if previous.Points > 0 {
			if previous.Member == nil {
				return errors.New("MISSING_ORDER_MEMBER")
			}
			ms, e := tx.Get(previous.Member)
			if e != nil {
				return e
			}
			if e = ms.DataTo(&member); e != nil {
				return e
			}
		}
		coupons := []ecCoupon{}
		for _, code := range discounts {
			cs, e := tx.Get(ecRef(h.fs, code))
			if status.Code(e) == codes.NotFound {
				continue
			}
			if e != nil {
				return e
			}
			var c ecCoupon
			if e = cs.DataTo(&c); e != nil {
				return e
			}
			if (c.Purchase == "" && c.Customer != customer) || (c.OrderID != "" && c.OrderID != id) {
				return errors.New("COUPON_ORDER_CONFLICT")
			}
			coupons = append(coupons, c)
		}
		if previous.Points > 0 {
			if e = tx.Update(previous.Member, []firestore.Update{{Path: "point", Value: member.Point - previous.Points}}); e != nil {
				return e
			}
			if e = tx.Create(previous.Member.Collection("point_logs").Doc("shopify_order_"+id+"_reversal"), map[string]any{"type": "refund", "source": "shopify", "amount": -previous.Points, "accumulate": false, "shopify_order_id": id, "created_at": now}); e != nil {
				return e
			}
		}
		for _, c := range coupons {
			c.Status = "void"
			c.OrderID = id
			if e = tx.Set(ecRef(h.fs, c.Code), c); e != nil {
				return e
			}
			if e = tx.Set(config.DataCollection(h.fs, "members").Doc(c.UID).Collection("shopify_coupons").Doc(c.ID), c); e != nil {
				return e
			}
		}
		return tx.Set(ledger, map[string]any{"order_id": id, "webhook_state": "reversed", "reversed_at": now}, firestore.MergeAll)
	})
}
