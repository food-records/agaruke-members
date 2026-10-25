// Command survey-reward-provision prepares the survey reward allowlist.
// The source TSV is private operational data and must never be committed.
package main

import (
	"context"
	"encoding/csv"
	"errors"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
)

const campaignID = "agaruke-2026-survey-500"

var validUID = regexp.MustCompile(`^U[0-9a-f]{32}$`)

func readEligible(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.Comma = '\t'
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, errors.New("empty TSV")
	}
	uidCol, typeCol := -1, -1
	for i, title := range rows[0] {
		switch strings.TrimSpace(strings.TrimPrefix(title, "\ufeff")) {
		case "UID":
			uidCol = i
		case "区分":
			typeCol = i
		}
	}
	if uidCol < 0 || typeCol < 0 {
		return nil, errors.New("UID/区分 columns required")
	}
	seen := map[string]bool{}
	var eligible []string
	tests := 0
	for _, row := range rows[1:] {
		if len(row) == 0 || strings.TrimSpace(row[0]) == "" {
			continue
		}
		if _, err := strconv.Atoi(strings.TrimSpace(row[0])); err != nil {
			if len(seen) == 26 {
				break
			}
			return nil, errors.New("unexpected row before 26 recipients")
		}
		if len(row) <= uidCol || len(row) <= typeCol || !validUID.MatchString(strings.TrimSpace(row[uidCol])) {
			return nil, errors.New("invalid UID row")
		}
		uid := strings.TrimSpace(row[uidCol])
		if seen[uid] {
			return nil, errors.New("duplicate UID")
		}
		seen[uid] = true
		if row[typeCol] == "テスト" {
			tests++
			continue
		}
		if row[typeCol] != "回答者" {
			return nil, errors.New("unexpected recipient type")
		}
		eligible = append(eligible, uid)
	}
	if tests != 1 || len(eligible) != 25 || len(seen) != 26 {
		return nil, fmt.Errorf("expected 25 recipients and one test account; got %d and %d", len(eligible), tests)
	}
	return eligible, nil
}

func main() {
	file := flag.String("file", "", "private survey status TSV")
	project := flag.String("project", "", "Firestore project ID")
	expires := flag.String("expires", "", "claim end time RFC3339")
	apply := flag.Bool("apply", false, "create Firestore campaign and eligibility docs")
	activate := flag.Bool("activate", false, "enable claims as part of the atomic creation")
	flag.Parse()
	if *file == "" || *project == "" || *expires == "" {
		flag.Usage()
		os.Exit(2)
	}
	end, err := time.Parse(time.RFC3339, *expires)
	if err != nil || !end.After(time.Now()) {
		fmt.Fprintln(os.Stderr, "future RFC3339 expiry required")
		os.Exit(2)
	}
	uids, err := readEligible(*file)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("validated %d eligible UIDs; one test UID excluded; expires %s; active=%t\n", len(uids), end.Format(time.RFC3339), *activate)
	if !*apply {
		return
	}
	ctx := context.Background()
	fs, err := firestore.NewClient(ctx, *project)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer fs.Close()
	campaign := config.OrganizationRef(fs).Collection("point_campaigns").Doc(campaignID)
	batch := fs.Batch()
	batch.Create(campaign, map[string]interface{}{"enabled": *activate, "ends_at": end, "points": 500, "created_at": time.Now().UTC()})
	for _, uid := range uids {
		batch.Create(campaign.Collection("eligible").Doc(uid), map[string]interface{}{"eligible": true})
	}
	if _, err := batch.Commit(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("campaign and 25 eligibility documents created")
}
