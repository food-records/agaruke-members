package member

import "testing"

func TestExplicitZeroTotalNeverUsesLimitedBalance(t *testing.T) {
	member := memberDoc{Point: 200, TotalEarnedPoint: 0}
	if n := effectiveTotalEarned(member, true); n != 0 {
		t.Fatalf("explicit zero became %d", n)
	}
	if n := effectiveTotalEarned(member, false); n != 200 {
		t.Fatalf("legacy absent total lost: %d", n)
	}
}
