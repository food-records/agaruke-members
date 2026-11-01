package shopify

import (
	"encoding/json"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/lineauth"
	"github.com/foodrecords/members-api/pkg/presenter"
	"io"
	"net/http"
	"os"
	"time"
)

// Service-key protected: Node forwards the LINE token, never a browser-supplied UID.
func (h handler) LIFFAction(w http.ResponseWriter, r *http.Request) {
	profile, e := lineauth.GetProfile(bearer(r))
	if e != nil {
		presenter.Forbidden(w, "INVALID_TOKEN")
		return
	}
	var b customerActionRequest
	if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&b) != nil {
		presenter.BadRequest(w, "INVALID_ACTION")
		return
	}
	if b.Action != "status" && b.Action != "exchange" && b.Action != "activate" {
		presenter.BadRequest(w, "INVALID_ACTION")
		return
	}
	uid := profile.UserID
	// No automatic member registration, and no Shopify account/link requirement.
	ms, e := config.DataCollection(h.fs, "members").Doc(uid).Get(r.Context())
	if e != nil {
		presenter.Forbidden(w, "MEMBER_REGISTRATION_REQUIRED")
		return
	}
	var m memberDoc
	if ms.DataTo(&m) != nil || m.DeletedAt != nil {
		presenter.Forbidden(w, "MEMBER_NOT_ACTIVE")
		return
	}
	b.LIFF = true
	b.Customer = ""
	b.Purchase = "liff:" + tokenHash(uid)
	if b.Action != "status" {
		if os.Getenv("SHOPIFY_LINK_TEST_ONLY") == "true" && os.Getenv("SHOPIFY_COUPON_EXCHANGE_ENABLED") != "true" {
			presenter.Forbidden(w, "EXCHANGE_DISABLED")
			return
		}
		h.memberAction(w, r, b, uid, time.Now())
		return
	}
	docs, e := ms.Ref.Collection("shopify_coupons").Documents(r.Context()).GetAll()
	if e != nil {
		presenter.Error(w, e)
		return
	}
	coupons := []map[string]any{}
	for _, d := range docs {
		var c ecCoupon
		if d.DataTo(&c) != nil || c.UID != uid {
			continue
		}
		coupons = append(coupons, map[string]any{"id": c.ID, "code": c.Code, "cost": c.Cost, "minimum": c.Minimum, "status": c.Status, "expires_at": c.ExpiresAt, "login_required": c.Customer != "", "retryable": c.Purchase == b.Purchase})
	}
	presenter.EncodeWithMessage(w, map[string]any{"point": m.Point, "coupons": coupons})
}
