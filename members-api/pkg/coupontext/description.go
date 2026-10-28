package coupontext

import "fmt"

// Title returns the customer-facing title managed by the API.
func Title(stored, target string, limit int) string {
	return stored
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
		return fmt.Sprintf("200円以下の%sまたは指定ドリンク%d点無料。", object, quantity)
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
