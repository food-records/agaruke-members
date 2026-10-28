package shopify

import (
	"encoding/json"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/presenter"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"io"
	"net/http"
	"time"
)

// SessionStorage accepts only AES-GCM ciphertext from the app backend.
// OAuth access/refresh tokens are never stored as readable Firestore fields.
func (h handler) SessionStorage(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Action string `json:"action"`
		ID     string `json:"id"`
		Shop   string `json:"shop"`
		Sealed string `json:"sealed"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 65536)).Decode(&b) != nil || b.Shop != configuredShop() || configuredShop() == "" || len(b.ID) > 500 {
		presenter.BadRequest(w, "INVALID_SESSION_REQUEST")
		return
	}
	col := config.DataCollection(h.fs, "shopify_app_sessions")
	ref := col.Doc(tokenHash(b.Shop + ":" + b.ID))
	ctx := r.Context()
	switch b.Action {
	case "store":
		if b.ID == "" || len(b.Sealed) < 60 {
			presenter.BadRequest(w, "INVALID_SESSION_REQUEST")
			return
		}
		if _, e := ref.Set(ctx, map[string]any{"shop": b.Shop, "sealed": b.Sealed, "updated_at": time.Now()}); e != nil {
			presenter.Error(w, e)
			return
		}
		presenter.Success(w)
	case "load":
		snap, e := ref.Get(ctx)
		if status.Code(e) == codes.NotFound {
			presenter.EncodeWithMessage(w, map[string]any{"sealed": nil})
			return
		}
		if e != nil {
			presenter.Error(w, e)
			return
		}
		presenter.EncodeWithMessage(w, map[string]any{"sealed": snap.Data()["sealed"]})
	case "delete":
		if _, e := ref.Delete(ctx); e != nil {
			presenter.Error(w, e)
			return
		}
		presenter.Success(w)
	case "find":
		docs, e := col.Where("shop", "==", b.Shop).Documents(ctx).GetAll()
		if e != nil {
			presenter.Error(w, e)
			return
		}
		sealed := []any{}
		for _, d := range docs {
			sealed = append(sealed, d.Data()["sealed"])
		}
		presenter.EncodeWithMessage(w, map[string]any{"sessions": sealed})
	default:
		presenter.BadRequest(w, "INVALID_ACTION")
	}
}
