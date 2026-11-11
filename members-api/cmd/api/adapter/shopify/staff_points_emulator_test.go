package shopify

import (
	"cloud.google.com/go/firestore"
	"context"
	"os"
	"testing"
)

func TestExplicitZeroMemberTotalEmulator(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("isolated emulator required")
	}
	ctx := context.Background()
	fs, e := firestore.NewClient(ctx, "demo-explicit-point-total")
	if e != nil {
		t.Fatal(e)
	}
	defer fs.Close()
	for _, explicit := range []bool{true, false} {
		data := map[string]interface{}{"point": 200}
		if explicit {
			data["total_earned_point"] = 0
		}
		ref := fs.Collection("members").Doc("fixture")
		if _, e = ref.Set(ctx, data); e != nil {
			t.Fatal(e)
		}
		e = fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			m, e := activeMember(tx, ref)
			if e != nil {
				return e
			}
			want := 200
			if explicit {
				want = 0
			}
			if m.TotalEarnedPoint != want {
				t.Fatalf("explicit=%v: total=%d", explicit, m.TotalEarnedPoint)
			}
			return nil
		})
		if e != nil {
			t.Fatal(e)
		}
	}
}
