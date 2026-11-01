// Command point-voucher-issue creates one-time bearer vouchers. Keep the output private.
package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"flag"
	"fmt"
	"os"
	"regexp"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
)

var campaignPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,80}$`)

func newCode() (string, string, error) {
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", "", err
	}
	code := "PV_" + base64.RawURLEncoding.EncodeToString(bytes[:])
	hash := sha256.Sum256([]byte(code))
	return code, hex.EncodeToString(hash[:]), nil
}

func main() {
	project := flag.String("project", "", "Firestore project")
	campaignID := flag.String("campaign", "", "unique campaign ID")
	count := flag.Int("count", 0, "number of unique vouchers, max 400")
	points := flag.Int("points", 0, "points per voucher")
	expires := flag.String("expires", "", "RFC3339 claim deadline")
	output := flag.String("output", "", "private TSV output path")
	liffID := flag.String("liff-id", "2000938587-06YmdyJ5", "LIFF ID")
	apply := flag.Bool("apply", false, "create campaign and vouchers")
	activate := flag.Bool("activate", false, "enable claims immediately")
	flag.Parse()
	end, err := time.Parse(time.RFC3339, *expires)
	if *project == "" || !campaignPattern.MatchString(*campaignID) || *count < 1 || *count > 400 || *points < 1 || *points > 100000 || err != nil || !end.After(time.Now()) || (*apply && *output == "") || (*activate && !*apply) {
		fmt.Fprintln(os.Stderr, "project, campaign, count 1..400, points 1..100000, future expires, and private output with --apply required")
		os.Exit(2)
	}
	fmt.Printf("campaign=%s count=%d points=%d expires=%s active=%t apply=%t\n", *campaignID, *count, *points, end.Format(time.RFC3339), *activate, *apply)
	if !*apply {
		return
	}
	ctx := context.Background()
	fs, err := firestore.NewClient(ctx, *project)
	if err != nil {
		panic(err)
	}
	defer fs.Close()
	base := config.OrganizationRef(fs)
	campaign := base.Collection("point_voucher_campaigns").Doc(*campaignID)
	if _, err := campaign.Get(ctx); err == nil {
		fmt.Fprintln(os.Stderr, "campaign already exists")
		os.Exit(1)
	}
	if _, err := os.Stat(*output); !os.IsNotExist(err) {
		fmt.Fprintln(os.Stderr, "output already exists or cannot be checked")
		os.Exit(1)
	}
	codes := make([]string, *count)
	hashes := make([]string, *count)
	for i := range codes {
		codes[i], hashes[i], err = newCode()
		if err != nil {
			panic(err)
		}
	}
	// Create the private delivery file before writing Firestore; if creation fails, no voucher is issued.
	f, err := os.OpenFile(*output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		panic(err)
	}
	fmt.Fprintln(f, "campaign\tcode\turl")
	for _, code := range codes {
		fmt.Fprintf(f, "%s\t%s\thttps://liff.line.me/%s/?voucher=%s\n", *campaignID, code, *liffID, code)
	}
	if err := f.Close(); err != nil {
		panic(err)
	}
	batch := fs.Batch()
	batch.Create(campaign, map[string]interface{}{"enabled": *activate, "points": *points, "ends_at": end, "created_at": time.Now().UTC(), "issued_count": *count})
	for _, hash := range hashes {
		batch.Create(base.Collection("point_vouchers").Doc(hash), map[string]interface{}{"campaign_id": *campaignID, "created_at": time.Now().UTC()})
	}
	if _, err := batch.Commit(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "Firestore issue failed; private output retained for reconciliation:", err)
		os.Exit(1)
	}
	fmt.Printf("issued %d unique vouchers; private output=%s\n", *count, *output)
}
