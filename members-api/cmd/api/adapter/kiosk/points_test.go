package kiosk

import (
	"testing"
	"time"
)

func TestDailyPurchasePointLogIDUsesTokyoDate(t *testing.T) {
	at := time.Date(2026, 9, 9, 15, 30, 0, 0, time.UTC)
	if got := dailyPurchasePointLogID(at); got != "daily_purchase_2026-09-10" {
		t.Fatalf("unexpected log ID: %s", got)
	}
}

func TestDailyPurchaseThreshold(t *testing.T) {
	if 499 >= dailyPurchaseMinimumSubtotal || 500 < dailyPurchaseMinimumSubtotal {
		t.Fatal("daily purchase threshold must be 500 yen inclusive")
	}
}
