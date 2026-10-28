package shopify

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/lineauth"
	"github.com/foodrecords/members-api/pkg/presenter"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var errMemberNotActive = errors.New("MEMBER_NOT_ACTIVE")

var ecCodePattern = regexp.MustCompile(`^AM[A-F0-9]{64}$`)

var numericID = regexp.MustCompile(`^[1-9][0-9]*$`)
var requestID = regexp.MustCompile(`^[a-zA-Z0-9_-]{16,80}$`)

func customerID(value string) string {
	value = strings.TrimPrefix(value, "gid://shopify/Customer/")
	if !numericID.MatchString(value) {
		return ""
	}
	return value
}
func linkRef(fs *firestore.Client, id string) *firestore.DocumentRef {
	return config.DataCollection(fs, "shopify_customer_links").Doc(tokenHash(configuredShop() + ":" + id))
}
func reverseRef(fs *firestore.Client, uid string) *firestore.DocumentRef {
	return config.DataCollection(fs, "shopify_member_links").Doc(tokenHash(configuredShop() + ":" + uid))
}

type linkIntent struct {
	ConfirmationHash string    `firestore:"confirmation_hash"`
	Attempts         int       `firestore:"attempts"`
	Customer         string    `firestore:"customer"`
	Candidate        string    `firestore:"candidate"`
	ExpiresAt        time.Time `firestore:"expires_at"`
	Consumed         bool      `firestore:"consumed"`
}
type ecCoupon struct {
	ID         string    `firestore:"id" json:"id"`
	Purchase   string    `firestore:"purchase,omitempty" json:"-"`
	Code       string    `firestore:"code" json:"code"`
	Customer   string    `firestore:"customer" json:"-"`
	UID        string    `firestore:"uid" json:"-"`
	Cost       int       `firestore:"cost" json:"cost"`
	Minimum    int       `firestore:"minimum" json:"minimum"`
	Status     string    `firestore:"status" json:"status"`
	DiscountID string    `firestore:"discount_id" json:"-"`
	ExpiresAt  time.Time `firestore:"expires_at" json:"expires_at"`
	OrderID    string    `firestore:"order_id" json:"-"`
}

var ecTiers = map[int]int{200: 4000, 500: 7000, 1000: 12000}

func ecRef(fs *firestore.Client, code string) *firestore.DocumentRef {
	return config.DataCollection(fs, "shopify_coupons").Doc(tokenHash(configuredShop() + ":" + code))
}
func activeMember(tx *firestore.Transaction, ref *firestore.DocumentRef) (memberDoc, error) {
	var m memberDoc
	s, e := tx.Get(ref)
	if e != nil {
		return m, e
	}
	e = s.DataTo(&m)
	if e == nil && m.DeletedAt != nil {
		e = errMemberNotActive
	}
	return m, e
}

type customerActionRequest struct {
	Purchase         string `json:"-"`
	ConfirmationCode string `json:"confirmation_code"`
	Action           string `json:"action"`
	Customer         string `json:"customer"`
	Token            string `json:"token"`
	RequestID        string `json:"request_id"`
	Cost             int    `json:"cost"`
	Code             string `json:"code"`
	DiscountID       string `json:"discount_id"`
}

// CustomerAction is called only by the app backend after Shopify's official
// library verifies a fully authenticated Customer Account session. Browser IDs
// are never trusted. Every response is private and never cached.
func (h handler) CustomerAction(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var b customerActionRequest
	if json.NewDecoder(io.LimitReader(r.Body, 16384)).Decode(&b) != nil || customerID(b.Customer) == "" || configuredShop() == "" {
		presenter.BadRequest(w, "INVALID_REQUEST")
		return
	}
	b.Customer = customerID(b.Customer)
	now := time.Now()
	ctx := r.Context()
	if b.Action == "start" {
		token, e := randomToken()
		if e != nil {
			presenter.Error(w, e)
			return
		}
		_, e = config.DataCollection(h.fs, "shopify_link_intents").Doc(tokenHash(token)).Create(ctx, linkIntent{Customer: b.Customer, ExpiresAt: now.Add(linkSessionLifetime)})
		if e != nil {
			presenter.Error(w, e)
			return
		}
		liff := os.Getenv("SHOPIFY_LINK_LIFF_URL")
		u, e := url.Parse(liff)
		if e != nil || u.Scheme != "https" || u.Host != "liff.line.me" {
			presenter.Error(w, errors.New("SHOPIFY_LINK_LIFF_URL_NOT_CONFIGURED"))
			return
		}
		q := u.Query()
		q.Set("shopify_link", token)
		u.RawQuery = q.Encode()
		presenter.EncodeWithMessage(w, map[string]any{"token": token, "liff_url": u.String(), "expires_at": now.Add(linkSessionLifetime)})
		return
	}
	if b.Action == "confirm" || b.Action == "intent" {
		result := map[string]any{}
		invalidConfirmation := false
		e := h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			invalidConfirmation = false
			ref := config.DataCollection(h.fs, "shopify_link_intents").Doc(tokenHash(b.Token))
			snap, e := tx.Get(ref)
			if e != nil {
				return e
			}
			var intent linkIntent
			if e = snap.DataTo(&intent); e != nil {
				return e
			}
			if intent.Customer != b.Customer || !intent.ExpiresAt.After(now) || intent.Consumed {
				return errors.New("LINK_INTENT_EXPIRED")
			}
			if intent.Candidate == "" {
				result["ready"] = false
				return nil
			}
			memberRef := config.DataCollection(h.fs, "members").Doc(intent.Candidate)
			if _, e = activeMember(tx, memberRef); e != nil {
				return e
			}
			ms, e := tx.Get(memberRef)
			if e != nil {
				return e
			}
			result["ready"] = true
			result["member_number"] = ms.Data()["number"]
			if b.Action == "intent" {
				return nil
			}
			if intent.Attempts >= 5 {
				return errors.New("LINK_LOCKED")
			}
			if intent.ConfirmationHash == "" || tokenHash(strings.ToUpper(strings.TrimSpace(b.ConfirmationCode))) != intent.ConfirmationHash {
				invalidConfirmation = true
				return tx.Update(ref, []firestore.Update{{Path: "attempts", Value: intent.Attempts + 1}})
			}
			forward, reverse := linkRef(h.fs, b.Customer), reverseRef(h.fs, intent.Candidate)
			for _, check := range []struct {
				ref         *firestore.DocumentRef
				field, want string
			}{{forward, "line_user_id", intent.Candidate}, {reverse, "shopify_customer_id", b.Customer}} {
				s, e := tx.Get(check.ref)
				if e == nil && s.Data()[check.field] != check.want {
					return errors.New("ACCOUNT_ALREADY_LINKED")
				}
				if e != nil && status.Code(e) != codes.NotFound {
					return e
				}
			}
			doc := customerLinkDoc{LineUserID: intent.Candidate, ShopDomain: configuredShop(), ShopifyCustomer: b.Customer, LinkedAt: now}
			if e = tx.Set(forward, doc); e != nil {
				return e
			}
			if e = tx.Set(reverse, doc); e != nil {
				return e
			}
			return tx.Update(ref, []firestore.Update{{Path: "consumed", Value: true}})
		})
		if e != nil || invalidConfirmation {
			presenter.BadRequest(w, "LINK_NOT_AVAILABLE")
			return
		}
		presenter.EncodeWithMessage(w, result)
		return
	}
	snap, e := linkRef(h.fs, b.Customer).Get(ctx)
	if status.Code(e) == codes.NotFound {
		presenter.EncodeWithMessage(w, map[string]any{"linked": false})
		return
	}
	if e != nil {
		presenter.Error(w, e)
		return
	}
	var link customerLinkDoc
	if e = snap.DataTo(&link); e != nil {
		presenter.Error(w, e)
		return
	}
	h.memberAction(w, r, b, link.LineUserID, now)
}

func (h handler) memberAction(w http.ResponseWriter, r *http.Request, b customerActionRequest, uid string, now time.Time) {
	ctx := r.Context()
	scope := b.Customer
	if b.Purchase != "" {
		scope = "purchase:" + b.Purchase
	}
	memberRef := config.DataCollection(h.fs, "members").Doc(uid)
	if b.Action == "exchange" {
		if ecTiers[b.Cost] == 0 || !requestID.MatchString(b.RequestID) {
			presenter.BadRequest(w, "INVALID_EXCHANGE")
			return
		}
		// A stable request ID recovers the same coupon after timeouts. It never
		// refunds points on an ambiguous Admin API result and never creates a second code.
		id := tokenHash(configuredShop() + ":" + scope + ":" + b.RequestID)
		codeToken, e := randomToken()
		if e != nil {
			presenter.Error(w, e)
			return
		}
		code := "AM" + strings.ToUpper(codeToken)
		var coupon ecCoupon
		e = h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
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
			}
			m, e := activeMember(tx, memberRef)
			if e != nil {
				return e
			}
			ref := memberRef.Collection("shopify_coupons").Doc(id)
			old, e := tx.Get(ref)
			if e == nil {
				if e = old.DataTo(&coupon); e != nil {
					return e
				}
				if coupon.Cost != b.Cost || coupon.Customer != b.Customer || coupon.Purchase != b.Purchase {
					return errors.New("REQUEST_CONFLICT")
				}
				return nil
			}
			if status.Code(e) != codes.NotFound {
				return e
			}
			if m.Point < b.Cost {
				return errors.New("INSUFFICIENT_POINTS")
			}
			coupon = ecCoupon{ID: id, Code: code, Customer: b.Customer, Purchase: b.Purchase, UID: uid, Cost: b.Cost, Minimum: ecTiers[b.Cost], Status: "pending", ExpiresAt: now.AddDate(0, 3, 0)}
			if e = tx.Create(ref, coupon); e != nil {
				return e
			}
			if e = tx.Create(ecRef(h.fs, code), coupon); e != nil {
				return e
			}
			if e = tx.Create(memberRef.Collection("point_logs").Doc("shopify_exchange_"+id), map[string]any{"type": "exchange", "source": "shopify", "amount": -b.Cost, "accumulate": false, "created_at": now}); e != nil {
				return e
			}
			return tx.Update(memberRef, []firestore.Update{{Path: "point", Value: m.Point - b.Cost}})
		})
		if e != nil {
			presenter.BadRequest(w, "EXCHANGE_NOT_AVAILABLE")
			return
		}
		presenter.EncodeWithMessage(w, map[string]any{"coupon": coupon})
		return
	}
	if b.Action == "activate" {
		e := h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			if _, e := activeMember(tx, memberRef); e != nil {
				return e
			}
			ref := ecRef(h.fs, b.Code)
			s, e := tx.Get(ref)
			if e != nil {
				return e
			}
			var c ecCoupon
			if e = s.DataTo(&c); e != nil {
				return e
			}
			if c.Customer != b.Customer || (c.Purchase=="") != (b.Purchase=="") || c.UID != uid || !c.ExpiresAt.After(now) || (c.Status != "pending" && c.Status != "available") || !strings.HasPrefix(b.DiscountID, "gid://shopify/DiscountCodeNode/") {
				return errors.New("INVALID_COUPON")
			}
			if c.DiscountID != "" && c.DiscountID != b.DiscountID {
				return errors.New("DISCOUNT_CONFLICT")
			}
			c.Status = "available"
			c.DiscountID = b.DiscountID
			if e = tx.Set(ref, c); e != nil {
				return e
			}
			return tx.Set(memberRef.Collection("shopify_coupons").Doc(c.ID), c)
		})
		if e != nil {
			presenter.BadRequest(w, "COUPON_NOT_AVAILABLE")
			return
		}
		presenter.EncodeWithMessage(w, map[string]any{"active": true})
		return
	}
	if b.Action != "status" {
		presenter.BadRequest(w, "INVALID_ACTION")
		return
	}
	ms, e := memberRef.Get(ctx)
	if e != nil {
		presenter.Error(w, e)
		return
	}
	var m memberDoc
	if e = ms.DataTo(&m); e != nil {
		presenter.Error(w, e)
		return
	}
	if m.DeletedAt != nil {
		presenter.EncodeWithMessage(w, map[string]any{"linked": false})
		return
	}
	docs, e := memberRef.Collection("shopify_coupons").Documents(ctx).GetAll()
	if e != nil {
		presenter.Error(w, e)
		return
	}
	coupons := []ecCoupon{}
	for _, d := range docs {
		var c ecCoupon
		if d.DataTo(&c) == nil && c.Customer == b.Customer && c.Purchase == b.Purchase && c.ExpiresAt.After(now) && (c.Status == "pending" || c.Status == "available") {
			coupons = append(coupons, c)
		}
	}
	presenter.EncodeWithMessage(w, map[string]any{"linked": true, "point": m.Point, "member_number": ms.Data()["number"], "coupons": coupons})
}

// LINE only proposes a member. The initiating Shopify account must separately
// confirm the displayed member number before either link is committed.
func (h handler) ProposeLink(w http.ResponseWriter, r *http.Request) {
	profile, e := lineauth.GetProfile(bearer(r))
	if e != nil {
		presenter.Forbidden(w, "INVALID_TOKEN")
		return
	}
	var b struct {
		Token   string `json:"token"`
		Consent bool   `json:"consent"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&b) != nil || !b.Consent || len(b.Token) != 64 {
		presenter.BadRequest(w, "CONSENT_REQUIRED")
		return
	}
	pairing, e := randomToken()
	if e != nil {
		presenter.Error(w, e)
		return
	}
	confirmationCode := strings.ToUpper(pairing[:8])
	e = h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		ref := config.DataCollection(h.fs, "shopify_link_intents").Doc(tokenHash(b.Token))
		s, e := tx.Get(ref)
		if e != nil {
			return e
		}
		var intent linkIntent
		if e = s.DataTo(&intent); e != nil {
			return e
		}
		if intent.Consumed || !intent.ExpiresAt.After(time.Now()) || (intent.Candidate != "" && intent.Candidate != profile.UserID) {
			return errors.New("LINK_NOT_AVAILABLE")
		}
		if _, e = activeMember(tx, config.DataCollection(h.fs, "members").Doc(profile.UserID)); e != nil {
			return e
		}
		return tx.Update(ref, []firestore.Update{{Path: "candidate", Value: profile.UserID}, {Path: "confirmation_hash", Value: tokenHash(confirmationCode)}})
	})
	if e != nil {
		presenter.BadRequest(w, "LINK_NOT_AVAILABLE")
		return
	}
	presenter.EncodeWithMessage(w, map[string]any{"proposed": true, "confirmation_code": confirmationCode})
}
