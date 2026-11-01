package member

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
)

func TestPointVoucherEmulator(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("Firestore emulator required")
	}
	ctx := context.Background()
	fs, err := firestore.NewClient(ctx, "demo-voucher")
	if err != nil {
		t.Fatal(err)
	}
	defer fs.Close()
	id := fmt.Sprintf("voucher-%d", time.Now().UnixNano())
	campaigns := fs.Collection("test_voucher_campaigns")
	member := fs.Collection("test_voucher_members").Doc(id)
	now := time.Now().UTC()
	if _, err := campaigns.Doc(id).Set(ctx, map[string]interface{}{"enabled": true, "points": 500, "ends_at": now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	voucher := fs.Collection("test_vouchers").Doc(voucherHash("PV_" + id))
	if _, err := voucher.Set(ctx, map[string]interface{}{"campaign_id": id}); err != nil {
		t.Fatal(err)
	}
	if _, err := member.Set(ctx, map[string]interface{}{"point": 0}); err != nil {
		t.Fatal(err)
	}
	if _, err := claimPointVoucher(ctx, fs, campaigns, voucher, member, now); !errors.Is(err, errSurveyConsent) {
		t.Fatalf("without consent: %v", err)
	}
	if _, err := member.Update(ctx, []firestore.Update{{Path: "consented_at", Value: now}}); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make([]voucherClaimResult, 2)
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = claimPointVoucher(ctx, fs, campaigns, voucher, member, now)
		}(i)
	}
	wg.Wait()
	awards, used := 0, 0
	for i := range results {
		if errs[i] == nil && results[i].Awarded == 500 {
			awards++
		}
		if errors.Is(errs[i], errVoucherUsed) {
			used++
		}
	}
	if awards != 1 || used != 1 {
		t.Fatalf("concurrent claims: results=%+v errors=%v", results, errs)
	}
	snap, err := member.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["point"] != int64(500) {
		t.Fatalf("balance=%v", snap.Data()["point"])
	}
	second := fs.Collection("test_vouchers").Doc(voucherHash("PV_" + id + "-other"))
	if _, err := second.Set(ctx, map[string]interface{}{"campaign_id": id}); err != nil {
		t.Fatal(err)
	}
	if _, err := claimPointVoucher(ctx, fs, campaigns, second, member, now); !errors.Is(err, errVoucherDuplicate) {
		t.Fatalf("same campaign: %v", err)
	}
	if _, err := campaigns.Doc(id).Update(ctx, []firestore.Update{{Path: "enabled", Value: false}}); err != nil {
		t.Fatal(err)
	}
	third := fs.Collection("test_vouchers").Doc(voucherHash("PV_" + id + "-third"))
	if _, err := third.Set(ctx, map[string]interface{}{"campaign_id": id}); err != nil {
		t.Fatal(err)
	}
	if _, err := claimPointVoucher(ctx, fs, campaigns, third, member, now); !errors.Is(err, errVoucherInvalid) {
		t.Fatalf("disabled: %v", err)
	}
}
