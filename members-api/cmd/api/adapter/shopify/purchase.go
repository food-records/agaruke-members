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
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/lineauth"
	"github.com/foodrecords/members-api/pkg/presenter"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var secureToken = regexp.MustCompile(`^[a-f0-9]{64}$`)

type purchaseGrant struct {
	Challenge string    `firestore:"challenge"`
	UID       string    `firestore:"uid"`
	CodeHash  string    `firestore:"code_hash"`
	ExpiresAt time.Time `firestore:"expires_at"`
	Consumed  bool      `firestore:"consumed"`
}
type purchaseSession struct {
	CreatedAt time.Time `firestore:"created_at"`
	UID       string    `firestore:"uid"`
	CartHash  string    `firestore:"cart_hash"`
	Customer  string    `firestore:"customer"`
	OrderID   string    `firestore:"order_id"`
	ExpiresAt time.Time `firestore:"expires_at"`
}

func purchaseRef(fs *firestore.Client, token string) *firestore.DocumentRef {
	return config.DataCollection(fs, "shopify_purchase_sessions").Doc(tokenHash(token))
}
func grantRef(fs *firestore.Client, token string) *firestore.DocumentRef {
	return config.DataCollection(fs, "shopify_purchase_grants").Doc(tokenHash(token))
}

// PurchaseAuthorize returns the code only to the authenticated LINE browser.
// No polling endpoint exposes this code or the member to the initiating browser.
func (h handler) PurchaseAuthorize(w http.ResponseWriter, r *http.Request) {
	profile, e := lineauth.GetProfile(bearer(r))
	if e != nil {
		presenter.Forbidden(w, "INVALID_TOKEN")
		return
	}
	var b struct {
		Token   string `json:"token"`
		Consent bool   `json:"consent"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&b) != nil || !b.Consent || !secureToken.MatchString(b.Token) {
		presenter.BadRequest(w, "CONSENT_REQUIRED")
		return
	}
	code, e := randomToken()
	if e != nil {
		presenter.Error(w, e)
		return
	}
	e = h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		ref := grantRef(h.fs, b.Token)
		s, e := tx.Get(ref)
		if e != nil {
			return e
		}
		var g purchaseGrant
		if e = s.DataTo(&g); e != nil {
			return e
		}
		if g.Consumed || !g.ExpiresAt.After(time.Now()) || g.CodeHash != "" {
			return errors.New("GRANT_EXPIRED")
		}
		if _, e = activeMember(tx, config.DataCollection(h.fs, "members").Doc(profile.UserID)); e != nil {
			return e
		}
		return tx.Update(ref, []firestore.Update{{Path: "uid", Value: profile.UserID}, {Path: "code_hash", Value: tokenHash(code)}})
	})
	if e != nil {
		presenter.BadRequest(w, "GRANT_NOT_AVAILABLE")
		return
	}
	presenter.EncodeWithMessage(w, map[string]any{"code": code})
}

// PurchaseAction is service-key protected. Customer is populated only by the
// Shopify backend after verifying a Shopify-signed authenticated context.
func (h handler) PurchaseAction(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Action     string `json:"action"`
		Token      string `json:"token"`
		Code       string `json:"code"`
		Verifier   string `json:"verifier"`
		Challenge  string `json:"challenge"`
		Cart       string `json:"cart"`
		Customer   string `json:"customer"`
		OrderID    string `json:"order_id"`
		RequestID  string `json:"request_id"`
		Cost       int    `json:"cost"`
		DiscountID string `json:"discount_id"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&b) != nil {
		presenter.BadRequest(w, "INVALID_REQUEST")
		return
	}
	now := time.Now()
	ctx := r.Context()
	if b.Action == "start" {
		if !secureToken.MatchString(b.Challenge) {
			presenter.BadRequest(w, "INVALID_CHALLENGE")
			return
		}
		token, e := randomToken()
		if e != nil {
			presenter.Error(w, e)
			return
		}
		u, e := url.Parse(os.Getenv("SHOPIFY_LINK_LIFF_URL"))
		if e != nil || u.Scheme != "https" || u.Host != "liff.line.me" {
			presenter.BadRequest(w, "LIFF_NOT_CONFIGURED")
			return
		}
		_, e = grantRef(h.fs, token).Create(ctx, purchaseGrant{Challenge: b.Challenge, ExpiresAt: now.Add(10 * time.Minute)})
		if e != nil {
			presenter.Error(w, e)
			return
		}
		u, _ = url.Parse("https://members.agaruke.com/")
		q := u.Query()
		q.Set("shopify_purchase", token)
		u.RawQuery = q.Encode()
		presenter.EncodeWithMessage(w, map[string]any{"token": token, "liff_url": u.String()})
		return
	}
	if !secureToken.MatchString(b.Token) {
		presenter.BadRequest(w, "INVALID_TOKEN")
		return
	}
	if b.Action == "consume" {
		if !secureToken.MatchString(b.Verifier) || !secureToken.MatchString(b.Code) || b.Cart == "" || len(b.Cart) > 256 {
			presenter.BadRequest(w, "INVALID_PROOF")
			return
		}
		sessionToken, e := randomToken()
		if e != nil {
			presenter.Error(w, e)
			return
		}
		e = h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			ref := grantRef(h.fs, b.Token)
			s, e := tx.Get(ref)
			if e != nil {
				return e
			}
			var g purchaseGrant
			if e = s.DataTo(&g); e != nil {
				return e
			}
			if g.Consumed || !g.ExpiresAt.After(now) || g.UID == "" || g.CodeHash != tokenHash(b.Code) || g.Challenge != tokenHash(b.Verifier) {
				return errors.New("INVALID_PROOF")
			}
			if _, e = activeMember(tx, config.DataCollection(h.fs, "members").Doc(g.UID)); e != nil {
				return e
			}
			if e = tx.Create(purchaseRef(h.fs, sessionToken), purchaseSession{CreatedAt: now, UID: g.UID, CartHash: tokenHash(b.Cart), ExpiresAt: now.Add(24 * time.Hour)}); e != nil {
				return e
			}
			return tx.Update(ref, []firestore.Update{{Path: "consumed", Value: true}})
		})
		if e != nil {
			presenter.BadRequest(w, "PURCHASE_NOT_AVAILABLE")
			return
		}
		presenter.EncodeWithMessage(w, map[string]any{"token": sessionToken})
		return
	}
	snap, e := purchaseRef(h.fs, b.Token).Get(ctx)
	if e != nil {
		presenter.BadRequest(w, "PURCHASE_NOT_AVAILABLE")
		return
	}
	var p purchaseSession
	if snap.DataTo(&p) != nil || !p.ExpiresAt.After(now) || (b.Action != "bind_order" && (b.Cart == "" || tokenHash(b.Cart) != p.CartHash)) {
		presenter.BadRequest(w, "PURCHASE_EXPIRED")
		return
	}
	if p.OrderID != "" && (b.Action == "exchange" || b.Action == "activate") {
		presenter.BadRequest(w, "PURCHASE_COMPLETED")
		return
	}
	if b.Action == "bind" || b.Action == "bind_order" {
		customer := customerID(b.Customer)
		if customer == "" || (b.Action == "bind_order" && !numericID.MatchString(b.OrderID)) {
			presenter.BadRequest(w, "CUSTOMER_REQUIRED")
			return
		}
		e = h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			s, e := tx.Get(purchaseRef(h.fs, b.Token))
			if e != nil {
				return e
			}
			var current purchaseSession
			if e = s.DataTo(&current); e != nil {
				return e
			}
			if current.UID != p.UID || !current.ExpiresAt.After(now) || (current.Customer != "" && current.Customer != customer) || (current.OrderID != "" && b.OrderID != "" && current.OrderID != b.OrderID) {
				return errors.New("PURCHASE_CONFLICT")
			}
			if _, e = activeMember(tx, config.DataCollection(h.fs, "members").Doc(p.UID)); e != nil {
				return e
			}
			if b.Action == "bind_order" {
				s, e := tx.Get(purchaseOrderRef(h.fs, b.OrderID))
				if e != nil {
					return e
				}
				var o purchaseOrderContext
				if e = s.DataTo(&o); e != nil {
					return e
				}
				if o.Customer != customer || o.Purchase != tokenHash(b.Token) || o.CartHash != p.CartHash {
					return errors.New("ORDER_CONTEXT_MISMATCH")
				}
			}
			forward, reverse := linkRef(h.fs, customer), reverseRef(h.fs, p.UID)
			for _, check := range []struct {
				ref         *firestore.DocumentRef
				field, want string
			}{{forward, "line_user_id", p.UID}, {reverse, "shopify_customer_id", customer}} {
				s, e := tx.Get(check.ref)
				if e == nil && s.Data()[check.field] != check.want {
					return errors.New("ACCOUNT_ALREADY_LINKED")
				}
				if e != nil && status.Code(e) != codes.NotFound {
					return e
				}
			}
			doc := customerLinkDoc{LineUserID: p.UID, ShopDomain: configuredShop(), ShopifyCustomer: customer, LinkedAt: now}
			if e = tx.Set(forward, doc); e != nil {
				return e
			}
			if e = tx.Set(reverse, doc); e != nil {
				return e
			}
			return tx.Update(purchaseRef(h.fs, b.Token), []firestore.Update{{Path: "customer", Value: customer}})
		})
		if e != nil {
			presenter.BadRequest(w, "LINK_NOT_AVAILABLE")
			return
		}
		presenter.EncodeWithMessage(w, map[string]any{"linked": true})
		return
	}
	if b.Action == "status" {
		ms, e := config.DataCollection(h.fs, "members").Doc(p.UID).Get(ctx)
		if e != nil {
			presenter.BadRequest(w, "MEMBER_NOT_AVAILABLE")
			return
		}
		var m memberDoc
		if ms.DataTo(&m) != nil || m.DeletedAt != nil {
			presenter.BadRequest(w, "MEMBER_NOT_AVAILABLE")
			return
		}
		docs, e := config.DataCollection(h.fs, "members").Doc(p.UID).Collection("shopify_coupons").Documents(ctx).GetAll()
		if e != nil {
			presenter.Error(w, e)
			return
		}
		coupons := []ecCoupon{}
		for _, doc := range docs {
			var c ecCoupon
			if doc.DataTo(&c) == nil && c.Purchase != "" && c.ExpiresAt.After(now) && (c.Status == "available" || c.Status == "pending") {
				coupons = append(coupons, c)
			}
		}
		presenter.EncodeWithMessage(w, map[string]any{"permanent": p.Customer != "", "completed": p.OrderID != "", "point": m.Point, "member_number": ms.Data()["number"], "coupons": coupons})
		return
	}
	h.memberAction(w, r, customerActionRequest{Action: b.Action, Purchase: tokenHash(b.Token), RequestID: b.RequestID, Cost: b.Cost, Code: b.Code, DiscountID: b.DiscountID}, p.UID, now)
}

type purchaseOrderContext struct {
	Customer string `firestore:"customer"`
	Purchase string `firestore:"purchase"`
	CartHash string `firestore:"cart_hash"`
}

func purchaseOrderRef(fs *firestore.Client, id string) *firestore.DocumentRef {
	return config.DataCollection(fs, "shopify_purchase_orders").Doc(tokenHash(configuredShop() + ":" + id))
}
func (h handler) OrdersCreated(w http.ResponseWriter, r *http.Request) {
	raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
	if e != nil || r.Header.Get("X-Shopify-Shop-Domain") != configuredShop() || r.Header.Get("X-Shopify-Topic") != "orders/create" || !webhookSignatureValid(raw, r.Header.Get("X-Shopify-Hmac-Sha256"), os.Getenv("SHOPIFY_WEBHOOK_SECRET")) {
		presenter.Forbidden(w, "INVALID_WEBHOOK")
		return
	}
	var order paidOrder
	if json.Unmarshal(raw, &order) != nil || !numericID.MatchString(stringID(order.ID)) {
		presenter.BadRequest(w, "INVALID_ORDER")
		return
	}
	token := purchaseToken(order)
	if token == "" || !secureToken.MatchString(token) || order.Customer == nil {
		presenter.EncodeWithMessage(w, map[string]any{"recorded": false})
		return
	}
	s, e := purchaseRef(h.fs, token).Get(r.Context())
	if status.Code(e) == codes.NotFound {
		presenter.EncodeWithMessage(w, map[string]any{"recorded": false})
		return
	}
	if e != nil {
		presenter.Error(w, e)
		return
	}
	var p purchaseSession
	if s.DataTo(&p) != nil || order.CreatedAt.IsZero() || order.CreatedAt.Before(p.CreatedAt) || order.CreatedAt.After(p.ExpiresAt) || p.CartHash != tokenHash(order.CartToken) {
		presenter.EncodeWithMessage(w, map[string]any{"recorded": false})
		return
	}
	_, e = purchaseOrderRef(h.fs, stringID(order.ID)).Create(r.Context(), purchaseOrderContext{Customer: customerID(stringID(order.Customer.ID)), Purchase: tokenHash(token), CartHash: p.CartHash})
	if e != nil && status.Code(e) != codes.AlreadyExists {
		presenter.Error(w, e)
		return
	}
	presenter.EncodeWithMessage(w, map[string]any{"recorded": true})
}
