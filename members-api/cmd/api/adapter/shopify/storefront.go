package shopify

import (
	"cloud.google.com/go/firestore"
	"context"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/presenter"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"net/http"
	"time"
)

// Customer is supplied only by the Shopify backend's verified app proxy.
// A remembered link can resume a new cart, without accepting a browser UID.
func (h handler) storefrontState(w http.ResponseWriter, r *http.Request, token, cart, customer string, resume bool, now time.Time) {
	if cart == "" || len(cart) > 256 {
		presenter.BadRequest(w, "INVALID_CART")
		return
	}
	ctx := r.Context()
	uid := ""
	permanent, ready := false, false
	if secureToken.MatchString(token) {
		s, e := purchaseRef(h.fs, token).Get(ctx)
		if e != nil && status.Code(e) != codes.NotFound {
			presenter.Error(w, e)
			return
		}
		if e == nil {
			var p purchaseSession
			if s.DataTo(&p) == nil {
				e = h.requireSession(ctx, nil, p)
				if e != nil && e.Error() != "PURCHASE_REVOKED" {
					presenter.Error(w, e)
					return
				}
				if e == nil && p.ExpiresAt.After(now) && p.OrderID == "" && p.CartHash == tokenHash(cart) && (customer == "" || p.Customer == "" || p.Customer == customer) {
					uid = p.UID
					permanent = p.Customer != ""
					ready = true
				}
			}
		}
	}
	if uid == "" && customer != "" {
		s, e := linkRef(h.fs, customer).Get(ctx)
		if e != nil && status.Code(e) != codes.NotFound {
			presenter.Error(w, e)
			return
		}
		if e == nil {
			var link customerLinkDoc
			if s.DataTo(&link) == nil && link.ShopifyCustomer == customer && link.ShopDomain == configuredShop() {
				uid = link.LineUserID
				permanent = true
			}
		}
	}
	if uid == "" {
		presenter.EncodeWithMessage(w, map[string]any{"linked": false, "ready": false})
		return
	}
	ms, e := config.DataCollection(h.fs, "members").Doc(uid).Get(ctx)
	if e != nil {
		if status.Code(e) == codes.NotFound {
			presenter.EncodeWithMessage(w, map[string]any{"linked": false, "ready": false})
			return
		}
		presenter.Error(w, e)
		return
	}
	var m memberDoc
	if ms.DataTo(&m) != nil || m.DeletedAt != nil {
		presenter.EncodeWithMessage(w, map[string]any{"linked": false, "ready": false})
		return
	}
	newToken := ""
	if !ready && resume && customer != "" {
		newToken, e = randomToken()
		if e != nil {
			presenter.Error(w, e)
			return
		}
		e = h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			s, e := tx.Get(linkRef(h.fs, customer))
			if e != nil {
				return e
			}
			var link customerLinkDoc
			if e = s.DataTo(&link); e != nil {
				return e
			}
			if link.LineUserID != uid {
				return errMemberNotActive
			}
			s, e = tx.Get(reverseRef(h.fs, uid))
			if e != nil {
				return e
			}
			if s.Data()["shopify_customer_id"] != customer {
				return errMemberNotActive
			}
			if _, e = activeMember(tx, config.DataCollection(h.fs, "members").Doc(uid)); e != nil {
				return e
			}
			epoch, e := h.readEpoch(ctx, tx, uid)
			if e != nil {
				return e
			}
			return tx.Create(purchaseRef(h.fs, newToken), purchaseSession{Generation: epoch.Generation, UID: uid, Customer: customer, CartHash: tokenHash(cart), CreatedAt: now, ExpiresAt: now.Add(24 * time.Hour)})
		})
		if e != nil {
			presenter.BadRequest(w, "LINK_NOT_AVAILABLE")
			return
		}
		ready = true
	}
	docs, e := config.DataCollection(h.fs, "members").Doc(uid).Collection("shopify_coupons").Documents(ctx).GetAll()
	if e != nil {
		presenter.Error(w, e)
		return
	}
	coupons := []ecCoupon{}
	for _, d := range docs {
		var c ecCoupon
		if d.DataTo(&c) == nil && c.ExpiresAt.After(now) && c.Status == "available" && (c.Purchase != "" || (customer != "" && c.Customer == customer)) {
			coupons = append(coupons, c)
		}
	}
	presenter.EncodeWithMessage(w, map[string]any{"linked": true, "permanent": permanent, "ready": ready, "token": newToken, "coupons": coupons})
}
