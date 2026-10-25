package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadEligible(t *testing.T) {
	var data strings.Builder
	data.WriteString("元行\tUID\t区分\n")
	for i := 0; i < 26; i++ {
		kind := "回答者"
		if i == 0 {
			kind = "テスト"
		}
		fmt.Fprintf(&data, "%d\tU%032x\t%s\n", i+2, i+1, kind)
	}
	data.WriteString("\n確認範囲\tmetadata\n")
	path := filepath.Join(t.TempDir(), "private.tsv")
	if err := os.WriteFile(path, []byte(data.String()), 0600); err != nil {
		t.Fatal(err)
	}
	uids, err := readEligible(path)
	if err != nil || len(uids) != 25 {
		t.Fatalf("got %d UIDs, error %v", len(uids), err)
	}
	if strings.Contains(strings.Join(uids, ","), fmt.Sprintf("U%032x", 1)) {
		t.Fatal("test UID included")
	}
}
