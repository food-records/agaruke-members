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

func TestSurveyRewardClaimEmulator(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("Firestore emulator required")
	}
	ctx := context.Background()
	fs, err := firestore.NewClient(ctx, "demo-survey-reward")
	if err != nil {
		t.Fatal(err)
	}
	defer fs.Close()
	id := fmt.Sprintf("survey-%d", time.Now().UnixNano())
	campaign := fs.Collection("test_campaigns").Doc(id)
	member := fs.Collection("test_members").Doc(id)
	now := time.Now().UTC()
	if _, err := campaign.Set(ctx, map[string]interface{}{"enabled": true, "ends_at": now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if _, err := campaign.Collection("eligible").Doc(id).Set(ctx, map[string]interface{}{"eligible": true}); err != nil {
		t.Fatal(err)
	}
	if _, err := member.Set(ctx, map[string]interface{}{"point": 0, "total_earned_point": 0, "number": 123, "name": "test"}); err != nil {
		t.Fatal(err)
	}
	if _, err := claimSurveyReward(ctx, fs, campaign, member, id, now); !errors.Is(err, errSurveyConsent) {
		t.Fatalf("without consent: %v", err)
	}
	if _, err := claimSurveyReward(ctx, fs, campaign, member, "other-uid", now); !errors.Is(err, errSurveyIneligible) {
		t.Fatalf("wrong UID: %v", err)
	}
	if _, err := member.Update(ctx, []firestore.Update{{Path: "consented_at", Value: now}}); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make([]surveyClaimResult, 2)
	claimErrors := make([]error, 2)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], claimErrors[i] = claimSurveyReward(ctx, fs, campaign, member, id, now)
		}(i)
	}
	wg.Wait()
	for _, err := range claimErrors {
		if err != nil {
			t.Fatal(err)
		}
	}
	awards, duplicates := 0, 0
	for _, result := range results {
		if result.Awarded == 500 {
			awards++
		}
		if result.AlreadyClaimed {
			duplicates++
		}
	}
	if awards != 1 || duplicates != 1 {
		t.Fatalf("not idempotent: %+v", results)
	}
	snap, err := member.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["point"] != int64(500) || snap.Data()["total_earned_point"] != int64(0) {
		t.Fatalf("wrong balance: %v", snap.Data())
	}
	if _, err := member.Collection("point_logs").Doc(surveyRewardID).Get(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := campaign.Update(ctx, []firestore.Update{{Path: "enabled", Value: false}}); err != nil {
		t.Fatal(err)
	}
	if _, err := claimSurveyReward(ctx, fs, campaign, member, id, now); !errors.Is(err, errSurveyUnavailable) {
		t.Fatalf("disabled campaign: %v", err)
	}
}
