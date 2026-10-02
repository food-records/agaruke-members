package shopify

import (
	"net/http"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/go-chi/chi"
)

// NewRouter exposes only two public Shopify-facing boundaries:
//
//   - the Orders paid webhook, authenticated by Shopify's HMAC signature
//   - a short-lived linking-session endpoint, authenticated by LINE
//
// Customer-account extensions must validate their Shopify customer session on
// their own app backend, then call the internal consume endpoint.  This keeps
// Shopify app credentials out of the LIFF/browser and keeps LINE IDs out of
// Shopify cart/order attributes.
func NewRouter() http.Handler {
	r := chi.NewRouter()
	h := handler{fs: config.FS}
	r.Post("/webhooks/orders/paid", h.OrdersPaid)
	r.Post("/customer-link-sessions", h.CreateCustomerLinkSession)
	r.Group(func(internal chi.Router) {
		internal.Use(h.serviceAuth)
		internal.Post("/customer-links/consume", h.ConsumeCustomerLink)
	})
	return r
}

type handler struct{ fs *firestore.Client }
