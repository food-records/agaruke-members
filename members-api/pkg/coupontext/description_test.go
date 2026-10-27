package coupontext

import "testing"

func TestDescription(t *testing.T) {
	if got := Description("old wording", "item", 200, 1); got != "200円以下の商品1点無料。アイスコーヒー・冷やし掛川茶も対象です。" {
		t.Fatalf("special coupon description: %q", got)
	}
	if got := Description("custom wording", "item", 300, 1); got != "custom wording" {
		t.Fatalf("stored description: %q", got)
	}
	if got := Description("", "option", 200, 1); got != "200円以下のオプション1点無料" {
		t.Fatalf("option description: %q", got)
	}
}
