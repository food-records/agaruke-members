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
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
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

type paidOrder struct {
	ID             json.RawMessage `json:"id"`
	CartToken      string          `json:"cart_token"`
	CreatedAt      time.Time       `json:"created_at"`
	NoteAttributes []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"note_attributes"`
	Currency        string     `json:"currency"`
	Subtotal        string     `json:"subtotal_price"`
	TotalPrice      string     `json:"total_price"`
	FinancialStatus string     `json:"financial_status"`
	CancelledAt     *time.Time `json:"cancelled_at"`
	Test            bool       `json:"test"`
	DiscountCodes   []struct {
		Code string `json:"code"`
	} `json:"discount_codes"`
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

// OrdersPaid commits points, all used EC coupons and an order-wide dedupe
// ledger atomically. An order can never earn again after account relinking.
func (h handler) OrdersPaid(w http.ResponseWriter, r *http.Request) {
	shop := configuredShop()
	if shop == "" || strings.ToLower(strings.TrimSpace(r.Header.Get("X-Shopify-Shop-Domain"))) != shop {
		presenter.Forbidden(w, "INVALID_SHOP")
		return
	}
	if r.Header.Get("X-Shopify-Topic") != "orders/paid" {
		presenter.BadRequest(w, "INVALID_WEBHOOK_TOPIC")
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
	if err != nil {
		presenter.BadRequest(w, "INVALID_BODY")
		return
	}
	if !webhookSignatureValid(raw, r.Header.Get("X-Shopify-Hmac-Sha256"), os.Getenv("SHOPIFY_WEBHOOK_SECRET")) {
		presenter.Forbidden(w, "INVALID_WEBHOOK_SIGNATURE")
		return
	}
	var order paidOrder
	if json.Unmarshal(raw, &order) != nil || !numericID.MatchString(stringID(order.ID)) {
		presenter.BadRequest(w, "INVALID_ORDER")
		return
	}
	paidValue, validAmount := new(big.Rat).SetString(order.TotalPrice)
	if !validAmount || paidValue.Sign() <= 0 || order.FinancialStatus != "paid" || order.CancelledAt != nil || order.Currency != "JPY" || (order.Test && os.Getenv("SHOPIFY_ALLOW_TEST_ORDERS") != "true") {
		presenter.EncodeWithMessage(w, map[string]any{"awarded_points": 0, "reason": "INELIGIBLE_ORDER"})
		return
	}
	if err := h.consumeBearerCoupons(r.Context(), order); err != nil {
		presenter.Error(w, errors.New("COUPON_PROCESSING_FAILED"))
		return
	}
	id := ""
	if order.Customer != nil {
		id = customerID(stringID(order.Customer.ID))
	}
	if id == "" && purchaseToken(order) == "" {
		presenter.EncodeWithMessage(w, map[string]any{"awarded_points": 0, "reason": "MEMBER_NOT_LINKED"})
		return
	}
	awarded, err := h.applyPaidOrder(r.Context(), order, id, time.Now())
	if err != nil {
		presenter.Error(w, errors.New("SHOPIFY_ORDER_PROCESSING_FAILED"))
		return
	}
	presenter.EncodeWithMessage(w, map[string]any{"awarded_points": awarded})
}

func (h handler) applyPaidOrder(ctx context.Context, order paidOrder, customer string, now time.Time) (int, error) {
	orderID := stringID(order.ID)
	awarded := 0
	ledger := config.DataCollection(h.fs, "shopify_orders").Doc(tokenHash(configuredShop() + ":" + orderID))
	err := h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		awarded = 0 // Firestore retries callbacks; never carry a previous attempt's result.
		if _, e := tx.Get(ledger); e == nil {
			return nil
		} else if status.Code(e) != codes.NotFound {
			return e
		}
		var link customerLinkDoc
		var purchase *purchaseSession
		token := purchaseToken(order)
		if token == "" && os.Getenv("SHOPIFY_LINE_FIRST_ENABLED") == "true" {
			return nil
		}
		if token != "" {
			s, e := tx.Get(purchaseRef(h.fs, token))
			if status.Code(e) == codes.NotFound {
				return nil
			}
			if e != nil {
				return e
			}
			var p purchaseSession
			if e = s.DataTo(&p); e != nil {
				return e
			}
			if order.CreatedAt.IsZero() || order.CreatedAt.Before(p.CreatedAt) || order.CreatedAt.After(p.ExpiresAt) || p.CartHash != tokenHash(order.CartToken) || (p.OrderID != "" && p.OrderID != orderID) {
				return nil
			}
			if p.Customer != "" && p.Customer != customer {
				return errors.New("PURCHASE_CUSTOMER_CONFLICT")
			}
			link.LineUserID = p.UID
			purchase = &p
		} else {
			s, e := tx.Get(linkRef(h.fs, customer))
			if status.Code(e) == codes.NotFound {
				return nil
			}
			if e != nil {
				return e
			}
			if e = s.DataTo(&link); e != nil {
				return e
			}
		}
		memberRef := config.DataCollection(h.fs, "members").Doc(link.LineUserID)
		m, e := activeMember(tx, memberRef)
		if errors.Is(e, errMemberNotActive) || status.Code(e) == codes.NotFound {
			return nil
		}
		if e != nil {
			return e
		}
		coupons := []ecCoupon{}
		for _, discount := range order.DiscountCodes {
			if !ecCodePattern.MatchString(discount.Code) {
				continue
			}
			s, e := tx.Get(ecRef(h.fs, discount.Code))
			if e != nil {
				return e
			}
			var c ecCoupon
			if e = s.DataTo(&c); e != nil {
				return e
			}
			if (c.Purchase == "" && (c.Customer != customer || c.UID != link.LineUserID)) || (c.Status != "available" && c.Status != "pending" && !(c.Status == "used" && c.OrderID == orderID)) || (c.OrderID != "" && c.OrderID != orderID) {
				return errors.New("COUPON_ORDER_CONFLICT")
			}
			coupons = append(coupons, c)
		}
		if len(coupons) > 1 {
			return errors.New("MULTIPLE_MEMBERS_COUPONS")
		}
		total := m.TotalEarnedPoint
		if total == 0 && m.Point > 0 {
			total = m.Point
		}
		if e = tx.Update(memberRef, []firestore.Update{{Path: "point", Value: m.Point + basePurchasePoints}, {Path: "total_earned_point", Value: total + basePurchasePoints}, {Path: "last_accumulated_at", Value: now}}); e != nil {
			return e
		}
		log := map[string]any{"type": "purchase", "source": "shopify", "kind": "base", "rule_version": "shopify-base-v1", "amount": basePurchasePoints, "accumulate": true, "shopify_order_id": orderID, "base_amount": order.Subtotal, "currency": order.Currency, "awarded_points": basePurchasePoints, "status": "granted", "created_at": now, "acquired_at": now, "expires_at": now.AddDate(1, 0, 0)}
		if e = tx.Create(memberRef.Collection("point_logs").Doc(shopifyBasePointLogID(orderID)), log); e != nil {
			return e
		}
		for _, c := range coupons {
			c.Status = "used"
			c.OrderID = orderID
			if e = tx.Set(ecRef(h.fs, c.Code), c); e != nil {
				return e
			}
			if e = tx.Set(config.DataCollection(h.fs, "members").Doc(c.UID).Collection("shopify_coupons").Doc(c.ID), c); e != nil {
				return e
			}
		}
		if purchase != nil {
			if e = tx.Update(purchaseRef(h.fs, token), []firestore.Update{{Path: "order_id", Value: orderID}}); e != nil {
				return e
			}
		}
		if e = tx.Create(ledger, map[string]any{"order_id": orderID, "customer": customer, "member_ref": memberRef, "awarded_points": basePurchasePoints, "processed_at": now, "webhook_state": "paid"}); e != nil {
			return e
		}
		awarded = basePurchasePoints
		return nil
	})
	return awarded, err
}

func purchaseToken(order paidOrder) string {
	token := ""
	for _, a := range order.NoteAttributes {
		if a.Name == "_agaruke_purchase" {
			if token != "" || !secureToken.MatchString(a.Value) {
				return "invalid"
			}
			token = a.Value
		}
	}
	return token
}

// A guest-compatible code is a bearer voucher. Its actual Shopify redemption
// consumes the original owner's voucher even when the code was shared.
func (h handler) consumeBearerCoupons(ctx context.Context, order paidOrder) error {
	return h.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		coupons := []ecCoupon{}
		id := stringID(order.ID)
		for _, d := range order.DiscountCodes {
			if !ecCodePattern.MatchString(d.Code) {
				continue
			}
			s, e := tx.Get(ecRef(h.fs, d.Code))
			if status.Code(e) == codes.NotFound {
				continue
			}
			if e != nil {
				return e
			}
			var c ecCoupon
			if e = s.DataTo(&c); e != nil {
				return e
			}
			if c.Purchase == "" {
				continue
			}
			if c.OrderID != "" && c.OrderID != id {
				return errors.New("COUPON_ORDER_CONFLICT")
			}
			if c.Status == "void" || c.Status == "used" {
				continue
			}
			c.Status = "used"
			c.OrderID = id
			coupons = append(coupons, c)
		}
		for _, c := range coupons {
			if e := tx.Set(ecRef(h.fs, c.Code), c); e != nil {
				return e
			}
			if e := tx.Set(config.DataCollection(h.fs, "members").Doc(c.UID).Collection("shopify_coupons").Doc(c.ID), c); e != nil {
				return e
			}
		}
		return nil
	})
}
