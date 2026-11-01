package main

import (
	"regexp"
	"testing"
)

func TestNewCode(t *testing.T) {
	seen := map[string]bool{}
	pattern := regexp.MustCompile(`^PV_[A-Za-z0-9_-]{43}$`)
	for i := 0; i < 100; i++ {
		code, hash, err := newCode()
		if err != nil || !pattern.MatchString(code) || len(hash) != 64 || seen[code] {
			t.Fatalf("invalid or duplicate code: err=%v", err)
		}
		seen[code] = true
	}
}
