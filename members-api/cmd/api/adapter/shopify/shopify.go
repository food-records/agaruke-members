package shopify

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/lineauth"
	"github.com/foodrecords/members-api/pkg/presenter"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	basePurchasePoints  = 100
	linkSessionLifetime = 10 * time.Minute
)

type memberDoc struct {
	Point            int        `firestore:"point"`
	TotalEarnedPoint int        `firestore:"total_earned_point"`
	DeletedAt        *time.Time `firestore:"deleted_at,omitempty"`
}

type customerLinkDoc struct {
	LineUserID      string    `firestore:"line_user_id"`
	ShopDomain      string    `firestore:"shop_domain"`
	ShopifyCustomer string    `firestore:"shopify_customer_id"`
	LinkedAt        time.Time `firestore:"linked_at"`
}

type linkSessionDoc struct {
	LineUserID string    `firestore:"line_user_id"`
	ExpiresAt  time.Time `firestore:"expires_at"`
	ConsumedAt time.Time `firestore:"consumed_at,omitempty"`
}

type paidOrder struct {
	ID       json.RawMessage `json:"id"`
	Currency string          `json:"currency"`
	Subtotal string          `json:"subtotal_price"`
	Customer *struct {
		ID json.RawMessage `json:"id"`
	} `json:"customer"`
}

func tokenHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func bearer(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

func configuredShop() string {
	return strings.ToLower(strings.TrimSpace(os.Getenv("SHOPIFY_SHOP_DOMAIN")))
}

func stringID(value json.RawMessage) string {
	var s string
	if json.Unmarshal(value, &s) == nil && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	var n json.Number
	if json.Unmarshal(value, &n) == nil {
		return n.String()
	}
	return ""
}

func shopifyBasePointLogID(orderID string) string {
	return "shopify_order_" + orderID + "_base"
}

func webhookSignatureValid(raw []byte, received, secret string) bool {
	decoded, err := base64.StdEncoding.DecodeString(received)
	if err != nil || secret == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(raw)
	return hmac.Equal(decoded, mac.Sum(nil))
}

func (h handler) serviceAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected := os.Getenv("MEMBERS_SERVICE_KEY")
		provided := r.Header.Get("X-Members-Service-Key")
		if expected == "" || len(provided) != len(expected) || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			presenter.Forbidden(w, "INVALID_SERVICE_KEY")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CreateCustomerLinkSession proves the caller is a current LINE member and
// returns an opaque, short-lived challenge. A Shopify customer-account app
// exchanges it only after it has independently authenticated the Shopify
// customer. The browser never submits a LINE ID as a link target.
func (h handler) CreateCustomerLinkSession(w http.ResponseWriter, r *http.Request) {
	token := bearer(r)
	profile, err := lineauth.GetProfile(token)
	if err != nil {
		presenter.Forbidden(w, "INVALID_TOKEN")
		return
	}
	memberRef := config.DataCollection(h.fs, "members").Doc(profile.UserID)
	memberSnap, err := memberRef.Get(r.Context())
	if err != nil {
		if status.Code(err) == codes.NotFound {
			presenter.BadRequest(w, "MEMBER_REGISTRATION_REQUIRED")
			return
		}
		presenter.Error(w, err)
		return
	}
	var member memberDoc
	if err := memberSnap.DataTo(&member); err != nil || member.DeletedAt != nil {
		presenter.BadRequest(w, "MEMBER_REGISTRATION_REQUIRED")
		return
	}
	linkToken, err := randomToken()
	if err != nil {
		presenter.Error(w, err)
		return
	}
	now := time.Now()
	if _, err := config.DataCollection(h.fs, "shopify_customer_link_sessions").Doc(tokenHash(linkToken)).Create(r.Context(), linkSessionDoc{
		LineUserID: profile.UserID, ExpiresAt: now.Add(linkSessionLifetime),
	}); err != nil {
		presenter.Error(w, err)
		return
	}
	presenter.EncodeWithMessage(w, map[string]any{"link_token": linkToken, "expires_at": now.Add(linkSessionLifetime).Format(time.RFC3339)})
}

// ConsumeCustomerLink is internal-only. The future Shopify app must validate
// its customer-account session before calling this endpoint; MEMBERS_SERVICE_KEY
// is not a browser credential.
func (h handler) ConsumeCustomerLink(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LinkToken         string `json:"link_token"`
		ShopifyCustomerID string `json:"shopify_customer_id"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body) != nil || strings.TrimSpace(body.LinkToken) == "" || strings.TrimSpace(body.ShopifyCustomerID) == "" {
		presenter.BadRequest(w, "INVALID_BODY")
		return
	}
	shop := configuredShop()
	if shop == "" {
		presenter.Error(w, errors.New("SHOPIFY_SHOP_DOMAIN is not configured"))
		return
	}
	linkSession := config.DataCollection(h.fs, "shopify_customer_link_sessions").Doc(tokenHash(body.LinkToken))
	linkRef := config.DataCollection(h.fs, "shopify_customer_links").Doc(tokenHash(shop + ":" + strings.TrimSpace(body.ShopifyCustomerID)))
	now := time.Now()
	var lineUserID string
	err := h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		sessionSnap, err := tx.Get(linkSession)
		if err != nil {
			return err
		}
		var session linkSessionDoc
		if err := sessionSnap.DataTo(&session); err != nil {
			return err
		}
		if !session.ConsumedAt.IsZero() || !session.ExpiresAt.After(now) {
			return errors.New("LINK_SESSION_NOT_ACTIVE")
		}
		memberSnap, err := tx.Get(config.DataCollection(h.fs, "members").Doc(session.LineUserID))
		if err != nil {
			return err
		}
		var member memberDoc
		if err := memberSnap.DataTo(&member); err != nil || member.DeletedAt != nil {
			return errors.New("MEMBER_NOT_ACTIVE")
		}
		if existing, err := tx.Get(linkRef); err == nil {
			var link customerLinkDoc
			if err := existing.DataTo(&link); err != nil {
				return err
			}
			if link.LineUserID != session.LineUserID {
				return errors.New("SHOPIFY_CUSTOMER_ALREADY_LINKED")
			}
		} else if status.Code(err) == codes.NotFound {
			if err := tx.Create(linkRef, customerLinkDoc{LineUserID: session.LineUserID, ShopDomain: shop, ShopifyCustomer: strings.TrimSpace(body.ShopifyCustomerID), LinkedAt: now}); err != nil {
				return err
			}
		} else {
			return err
		}
		lineUserID = session.LineUserID
		return tx.Update(linkSession, []firestore.Update{{Path: "consumed_at", Value: now}})
	})
	if err != nil {
		presenter.BadRequest(w, err.Error())
		return
	}
	presenter.EncodeWithMessage(w, map[string]any{"linked": true, "line_user_id": lineUserID})
}

// OrdersPaid verifies Shopify's raw-body HMAC, resolves an explicitly linked
// Shopify Customer, then grants the base 100 points exactly once per Shopify
// order. No LINE identifier, email address, or customer name is read from the
// webhook or written to the points log.
func (h handler) OrdersPaid(w http.ResponseWriter, r *http.Request) {
	shop := configuredShop()
	if shop == "" || strings.ToLower(strings.TrimSpace(r.Header.Get("X-Shopify-Shop-Domain"))) != shop {
		presenter.Forbidden(w, "INVALID_SHOP")
		return
	}
	if strings.ToLower(strings.TrimSpace(r.Header.Get("X-Shopify-Topic"))) != "orders/paid" {
		presenter.BadRequest(w, "INVALID_WEBHOOK_TOPIC")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil {
		presenter.BadRequest(w, "INVALID_BODY")
		return
	}
	if !webhookSignatureValid(raw, r.Header.Get("X-Shopify-Hmac-Sha256"), os.Getenv("SHOPIFY_WEBHOOK_SECRET")) {
		presenter.Forbidden(w, "INVALID_WEBHOOK_SIGNATURE")
		return
	}
	var order paidOrder
	if json.Unmarshal(raw, &order) != nil {
		presenter.BadRequest(w, "INVALID_BODY")
		return
	}
	orderID := stringID(order.ID)
	customerID := ""
	if order.Customer != nil {
		customerID = stringID(order.Customer.ID)
	}
	if orderID == "" || customerID == "" {
		presenter.EncodeWithMessage(w, map[string]any{"awarded_points": 0, "reason": "MEMBER_NOT_LINKED"})
		return
	}
	linkRef := config.DataCollection(h.fs, "shopify_customer_links").Doc(tokenHash(shop + ":" + customerID))
	now := time.Now()
	awarded := 0
	err = h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		linkSnap, err := tx.Get(linkRef)
		if status.Code(err) == codes.NotFound {
			return nil
		}
		if err != nil {
			return err
		}
		var link customerLinkDoc
		if err := linkSnap.DataTo(&link); err != nil {
			return err
		}
		memberRef := config.DataCollection(h.fs, "members").Doc(link.LineUserID)
		memberSnap, err := tx.Get(memberRef)
		if err != nil {
			return err
		}
		var member memberDoc
		if err := memberSnap.DataTo(&member); err != nil {
			return err
		}
		if member.DeletedAt != nil {
			return nil
		}
		pointLog := memberRef.Collection("point_logs").Doc(shopifyBasePointLogID(orderID))
		if _, err := tx.Get(pointLog); err == nil {
			return nil
		} else if status.Code(err) != codes.NotFound {
			return err
		}
		totalEarned := member.TotalEarnedPoint
		if totalEarned == 0 && member.Point > 0 {
			totalEarned = member.Point
		}
		if err := tx.Update(memberRef, []firestore.Update{{Path: "point", Value: member.Point + basePurchasePoints}, {Path: "total_earned_point", Value: totalEarned + basePurchasePoints}, {Path: "last_accumulated_at", Value: now}}); err != nil {
			return err
		}
		if err := tx.Create(pointLog, map[string]any{"type": "purchase", "source": "shopify", "kind": "base", "rule_version": "shopify-base-v1", "amount": basePurchasePoints, "accumulate": true, "shopify_order_id": orderID, "base_amount": order.Subtotal, "currency": order.Currency, "awarded_points": basePurchasePoints, "status": "granted", "created_at": now, "acquired_at": now, "expires_at": now.AddDate(1, 0, 0)}); err != nil {
			return err
		}
		awarded = basePurchasePoints
		return nil
	})
	if err != nil {
		presenter.Error(w, err)
		return
	}
	presenter.EncodeWithMessage(w, map[string]any{"awarded_points": awarded})
}
