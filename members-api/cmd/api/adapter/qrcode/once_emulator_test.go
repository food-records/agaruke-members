package qrcode

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
)

func TestOnceSerialEmulator(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("Firestore emulator required")
	}
	ctx := context.Background()
	fs, err := firestore.NewClient(ctx, "demo-once-serial")
	if err != nil {
		t.Fatal(err)
	}
	defer fs.Close()
	id := fmt.Sprintf("serial-%d", time.Now().UnixNano())
	campaign := "survey-test-" + id
	now := time.Now().UTC()
	member := config.DataCollection(fs, "members").Doc(id)
	serials := config.DataCollection(fs, "serials")
	code := "FR1234567890" // old special case must now be consumed exactly once
	if _, err := member.Set(ctx, map[string]interface{}{"point": 0, "total_earned_point": 0, "number": 123}); err != nil {
		t.Fatal(err)
	}
	if _, err := serials.Doc(code).Set(ctx, map[string]interface{}{"point": 500, "used": false, "type": "once", "accumulate": false, "campaign_id": campaign, "expires_at": now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if _, err := redeemOnceSerial(ctx, fs, code, id, now); !errors.Is(err, errSerialConsent) {
		t.Fatalf("without consent: %v", err)
	}
	if _, err := member.Update(ctx, []firestore.Update{{Path: "consented_at", Value: now}}); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make([]PostResp, 2)
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); results[i], errs[i] = redeemOnceSerial(ctx, fs, code, id, now) }(i)
	}
	wg.Wait()
	awards, used := 0, 0
	for i := range results {
		if errs[i] == nil && results[i].GetPoint == 500 {
			awards++
		}
		if errors.Is(errs[i], errSerialUsed) {
			used++
		}
	}
	if awards != 1 || used != 1 {
		t.Fatalf("concurrent results=%+v errors=%v", results, errs)
	}
	snap, err := member.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["point"] != int64(500) || snap.Data()["total_earned_point"] != int64(0) {
		t.Fatalf("balance: %v", snap.Data())
	}
	serialSnap, err := serials.Doc(code).Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if serialSnap.Data()["used"] != true {
		t.Fatal("serial not consumed")
	}
	code2 := "FRABC12345"
	if _, err := serials.Doc(code2).Set(ctx, map[string]interface{}{"point": 500, "used": false, "type": "once", "accumulate": false, "campaign_id": campaign}); err != nil {
		t.Fatal(err)
	}
	if _, err := redeemOnceSerial(ctx, fs, code2, id, now); !errors.Is(err, errSerialDuplicate) {
		t.Fatalf("same campaign: %v", err)
	}
	code3 := "FRABC12346"
	if _, err := serials.Doc(code3).Set(ctx, map[string]interface{}{"point": 500, "used": false, "type": "once", "expires_at": now.Add(-time.Second)}); err != nil {
		t.Fatal(err)
	}
	if _, err := redeemOnceSerial(ctx, fs, code3, id, now); !errors.Is(err, errSerialExpired) {
		t.Fatalf("expired: %v", err)
	}
}
