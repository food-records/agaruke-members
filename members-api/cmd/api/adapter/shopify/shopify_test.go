package shopify

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"testing"
)

func TestWebhookSignatureValid(t *testing.T) {
	body := []byte(`{"id":123}`)
	secret := "test-secret"
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	if !webhookSignatureValid(body, signature, secret) {
		t.Fatal("expected valid signature")
	}
	if webhookSignatureValid([]byte(`{}`), signature, secret) {
		t.Fatal("must reject a changed body")
	}
	if webhookSignatureValid(body, signature, "") {
		t.Fatal("must reject a missing secret")
	}
}

func TestStringID(t *testing.T) {
	if got := stringID([]byte(`12345`)); got != "12345" {
		t.Fatalf("numeric id = %q", got)
	}
	if got := stringID([]byte(`"gid://shopify/Customer/12345"`)); got != "gid://shopify/Customer/12345" {
		t.Fatalf("string id = %q", got)
	}
	if got := stringID([]byte(`null`)); got != "" {
		t.Fatalf("null id = %q", got)
	}
}

func TestPointLogIDIsOrderScoped(t *testing.T) {
	if got := shopifyBasePointLogID("123"); got != "shopify_order_123_base" {
		t.Fatalf("point log id = %q", got)
	}
}
