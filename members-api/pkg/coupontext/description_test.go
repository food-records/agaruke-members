package coupontext

import "testing"

func TestDescription(t *testing.T) {
	if got := Title("基本トッピングチケット", "item_or_option", 200); got != "基本トッピングチケット" {
		t.Fatalf("special coupon title: %q", got)
	}
	if got := Description("old wording", "item", 200, 1); got != "200円以下の商品または指定ドリンク1点無料。" {
		t.Fatalf("special coupon description: %q", got)
	}
	if got := Description("old wording", "item_or_option", 200, 1); got != "200円以下の商品・オプションまたは指定ドリンク1点無料。" {
		t.Fatalf("special mixed coupon description: %q", got)
	}
	if got := Description("custom wording", "item", 300, 1); got != "custom wording" {
		t.Fatalf("stored description: %q", got)
	}
	if got := Description("", "option", 200, 1); got != "200円以下のオプション1点無料" {
		t.Fatalf("option description: %q", got)
	}
}
