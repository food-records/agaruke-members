package shopify

import (
	"net/http"
	"os"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/go-chi/chi"
)

// NewRouter keeps the Shopify business feature disabled until explicitly
// enabled. Public LINE consent and HMAC webhooks are separate from service-key
// protected Shopify backend operations; browsers never receive the service key.
func NewRouter() http.Handler {
	r := chi.NewRouter()
	h := handler{fs: config.FS}
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			if os.Getenv("SHOPIFY_MEMBERS_ENABLED") != "true" {
				http.Error(w, "SHOPIFY_MEMBERS_DISABLED", http.StatusServiceUnavailable)
				return
			}
			next.ServeHTTP(w, r)
		})
	})
	r.Post("/webhooks/orders/paid", h.OrdersPaid)

	r.Post("/link-intents/propose", h.ProposeLink)
	r.Group(func(internal chi.Router) {
		internal.Use(h.serviceAuth)
		internal.Post("/customer/action", h.CustomerAction)
		internal.Post("/orders/reverse", h.ReverseOrder)
		internal.Post("/app-sessions", h.SessionStorage)
	})
	return r
}

type handler struct{ fs *firestore.Client }
