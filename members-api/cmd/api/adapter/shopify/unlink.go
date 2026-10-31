package shopify

import (
	"cloud.google.com/go/firestore"
	"context"
	"errors"
	"fmt"
	"github.com/foodrecords/members-api/pkg/config"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"time"
)

type linkEpoch struct {
	Generation int64     `firestore:"generation"`
	RevokedAt  time.Time `firestore:"revoked_at"`
}

func epochRef(fs *firestore.Client, uid string) *firestore.DocumentRef {
	return config.DataCollection(fs, "shopify_link_epochs").Doc(tokenHash(configuredShop() + ":" + uid))
}
func revokedEpochRef(fs *firestore.Client, uid string, generation int64) *firestore.DocumentRef {
	return config.DataCollection(fs, "shopify_link_revocations").Doc(tokenHash(fmt.Sprintf("%s:%s:%d", configuredShop(), uid, generation)))
}
func (h handler) readEpoch(ctx context.Context, tx *firestore.Transaction, uid string) (linkEpoch, error) {
	var epoch linkEpoch
	var s *firestore.DocumentSnapshot
	var e error
	if tx != nil {
		s, e = tx.Get(epochRef(h.fs, uid))
	} else {
		s, e = epochRef(h.fs, uid).Get(ctx)
	}
	if status.Code(e) == codes.NotFound {
		return epoch, nil
	}
	if e != nil {
		return epoch, e
	}
	e = s.DataTo(&epoch)
	return epoch, e
}
func (h handler) sessionRevokedAt(ctx context.Context, tx *firestore.Transaction, p purchaseSession) (time.Time, error) {
	at := p.RevokedAt
	var s *firestore.DocumentSnapshot
	var e error
	ref := revokedEpochRef(h.fs, p.UID, p.Generation)
	if tx != nil {
		s, e = tx.Get(ref)
	} else {
		s, e = ref.Get(ctx)
	}
	if status.Code(e) == codes.NotFound {
		return at, nil
	}
	if e != nil {
		return at, e
	}
	var record linkEpoch
	if e = s.DataTo(&record); e != nil {
		return at, e
	}
	if at.IsZero() || (!record.RevokedAt.IsZero() && record.RevokedAt.Before(at)) {
		at = record.RevokedAt
	}
	return at, nil
}
func (h handler) requireSession(ctx context.Context, tx *firestore.Transaction, p purchaseSession) error {
	at, e := h.sessionRevokedAt(ctx, tx, p)
	if e != nil {
		return e
	}
	if !at.IsZero() {
		return errors.New("PURCHASE_REVOKED")
	}
	return nil
}

// Recorded orders survive unlink. Ambiguous same-second new orders fail closed.
func (h handler) orderRevoked(ctx context.Context, tx *firestore.Transaction, p purchaseSession, order paidOrder) (bool, error) {
	at, e := h.sessionRevokedAt(ctx, tx, p)
	if e != nil {
		return false, e
	}
	return !at.IsZero() && p.OrderID != stringID(order.ID) && !order.CreatedAt.Before(at.Truncate(time.Second)), nil
}
func (h handler) unlinkPurchase(ctx context.Context, token, cart, customer string, now time.Time) error {
	return h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		ref := purchaseRef(h.fs, token)
		s, e := tx.Get(ref)
		if e != nil {
			return e
		}
		var p purchaseSession
		if e = s.DataTo(&p); e != nil {
			return e
		}
		if p.CartHash != tokenHash(cart) || (p.Customer != "" && p.Customer != customer) {
			return errors.New("UNLINK_AUTH_REQUIRED")
		}
		at, e := h.sessionRevokedAt(ctx, tx, p)
		if e != nil {
			return e
		}
		if !at.IsZero() {
			return nil
		}
		epoch, e := h.readEpoch(ctx, tx, p.UID)
		if e != nil {
			return e
		}
		if epoch.Generation != p.Generation {
			return errors.New("LINK_GENERATION_CONFLICT")
		}
		permanent := false
		if customer != "" {
			forward, e := tx.Get(linkRef(h.fs, customer))
			if e != nil && status.Code(e) != codes.NotFound {
				return e
			}
			if e == nil {
				var link customerLinkDoc
				if e = forward.DataTo(&link); e != nil {
					return e
				}
				if link.LineUserID != p.UID || link.ShopifyCustomer != customer || link.ShopDomain != configuredShop() {
					return errors.New("LINK_CONFLICT")
				}
				reverse, e := tx.Get(reverseRef(h.fs, p.UID))
				if e != nil {
					return e
				}
				if reverse.Data()["shopify_customer_id"] != customer {
					return errors.New("LINK_CONFLICT")
				}
				permanent = true
			} else if p.Customer != "" {
				return errors.New("LINK_CONFLICT")
			}
		}
		if permanent {
			if e = tx.Set(revokedEpochRef(h.fs, p.UID, p.Generation), linkEpoch{Generation: p.Generation, RevokedAt: now}); e != nil {
				return e
			}
			if e = tx.Set(epochRef(h.fs, p.UID), linkEpoch{Generation: p.Generation + 1, RevokedAt: now}); e != nil {
				return e
			}
			if e = tx.Delete(linkRef(h.fs, customer)); e != nil {
				return e
			}
			if e = tx.Delete(reverseRef(h.fs, p.UID)); e != nil {
				return e
			}
		}
		return tx.Update(ref, []firestore.Update{{Path: "revoked_at", Value: now}})
	})
}
func (h handler) requireCouponContext(ctx context.Context, tx *firestore.Transaction, b customerActionRequest, uid string, now time.Time) error {
	if b.Purchase != "" {
		s, e := tx.Get(config.DataCollection(h.fs, "shopify_purchase_sessions").Doc(b.Purchase))
		if e != nil {
			return e
		}
		var p purchaseSession
		if e = s.DataTo(&p); e != nil {
			return e
		}
		if p.UID != uid || !p.ExpiresAt.After(now) || p.OrderID != "" {
			return errors.New("PURCHASE_NOT_AVAILABLE")
		}
		return h.requireSession(ctx, tx, p)
	}
	s, e := tx.Get(linkRef(h.fs, b.Customer))
	if e != nil {
		return e
	}
	if s.Data()["line_user_id"] != uid {
		return errors.New("LINK_NOT_AVAILABLE")
	}
	return nil
}

func linkHint(link customerLinkDoc) string {
	return tokenHash(link.ShopDomain + ":" + link.ShopifyCustomer + ":" + link.LineUserID + ":" + link.LinkedAt.UTC().Format(time.RFC3339Nano))
}
func (h handler) unlinkCustomer(ctx context.Context, customer, hint string, now time.Time) error {
	if !secureToken.MatchString(hint) {
		return errors.New("INVALID_LINK_HINT")
	}
	return h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		forward := linkRef(h.fs, customer)
		s, e := tx.Get(forward)
		if status.Code(e) == codes.NotFound {
			return nil
		}
		if e != nil {
			return e
		}
		var link customerLinkDoc
		if e = s.DataTo(&link); e != nil {
			return e
		}
		if link.ShopifyCustomer != customer || link.ShopDomain != configuredShop() || linkHint(link) != hint {
			return errors.New("LINK_CHANGED")
		}
		reverse := reverseRef(h.fs, link.LineUserID)
		r, e := tx.Get(reverse)
		if e != nil {
			return e
		}
		if r.Data()["shopify_customer_id"] != customer {
			return errors.New("LINK_CONFLICT")
		}
		epoch, e := h.readEpoch(ctx, tx, link.LineUserID)
		if e != nil {
			return e
		}
		if e = tx.Set(revokedEpochRef(h.fs, link.LineUserID, epoch.Generation), linkEpoch{Generation: epoch.Generation, RevokedAt: now}); e != nil {
			return e
		}
		if e = tx.Set(epochRef(h.fs, link.LineUserID), linkEpoch{Generation: epoch.Generation + 1, RevokedAt: now}); e != nil {
			return e
		}
		if e = tx.Delete(forward); e != nil {
			return e
		}
		return tx.Delete(reverse)
	})
}
