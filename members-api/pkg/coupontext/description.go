package coupontext

import (
	"fmt"
	"strings"
)

// Title keeps the exception visible on older Kiosk builds with a fixed subtitle.
func Title(stored, target string, limit int) string {
	if limit != 200 || target == "option" || strings.Contains(stored, "アイスコーヒー") {
		return stored
	}
	return stored + "（アイスコーヒー・冷やし掛川茶も対象）"
}

// Description supplies the customer-facing coupon rule from the API.
func Description(stored, target string, limit, quantity int) string {
	if limit == 200 && target != "option" {
		object := "商品・オプション"
		if target == "item" {
			object = "商品"
		}
		if quantity <= 0 {
			quantity = 1
		}
		return fmt.Sprintf("200円以下の%s%d点無料。アイスコーヒー・冷やし掛川茶も対象です。", object, quantity)
	}
	if stored != "" {
		return stored
	}
	if limit <= 0 {
		return ""
	}
	if quantity <= 0 {
		quantity = 1
	}
	object := "商品・オプション"
	if target == "item" {
		object = "商品"
	} else if target == "option" {
		object = "オプション"
	}
	return fmt.Sprintf("%d円以下の%s%d点無料", limit, object, quantity)
}
