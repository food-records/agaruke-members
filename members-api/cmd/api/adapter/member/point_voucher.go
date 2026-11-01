package member

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/presenter"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var voucherCodePattern = regexp.MustCompile(`^PV_[A-Za-z0-9_-]{43}$`)

var (
	errVoucherInvalid   = errors.New("POINT_VOUCHER_INVALID")
	errVoucherUsed      = errors.New("POINT_VOUCHER_USED")
	errVoucherDuplicate = errors.New("POINT_VOUCHER_ALREADY_CLAIMED")
)

type voucherCampaign struct {
	Enabled bool      `firestore:"enabled"`
	Points  int       `firestore:"points"`
	EndsAt  time.Time `firestore:"ends_at"`
}

type pointVoucher struct {
	CampaignID string     `firestore:"campaign_id"`
	UsedAt     *time.Time `firestore:"used_at,omitempty"`
}

type voucherClaimResult struct {
	Point   int `json:"point"`
	Awarded int `json:"awarded"`
}

func voucherHash(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

func (h handler) ClaimPointVoucher(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil || !voucherCodePattern.MatchString(body.Code) {
		presenter.BadRequest(w, errVoucherInvalid.Error())
		return
	}
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	profile, err := getProfile(token)
	if err != nil || profile.UserID == "" {
		presenter.Forbidden(w, "INVALID_TOKEN")
		return
	}
	base := config.OrganizationRef(h.fs).Collection("point_voucher_campaigns")
	voucher := config.OrganizationRef(h.fs).Collection("point_vouchers").Doc(voucherHash(body.Code))
	member := config.DataCollection(h.fs, "members").Doc(profile.UserID)
	result, err := claimPointVoucher(r.Context(), h.fs, base, voucher, member, time.Now().UTC())
	switch {
	case err == nil:
		presenter.EncodeWithMessage(w, result)
	case errors.Is(err, errVoucherInvalid), errors.Is(err, errVoucherUsed), errors.Is(err, errVoucherDuplicate):
		presenter.BadRequest(w, err.Error())
	case errors.Is(err, errSurveyRegister), errors.Is(err, errSurveyConsent):
		presenter.BadRequest(w, err.Error())
	case errors.Is(err, errSurveyDeleted):
		presenter.Forbidden(w, err.Error())
	default:
		presenter.Error(w, err)
	}
}

func claimPointVoucher(ctx context.Context, fs *firestore.Client, campaigns *firestore.CollectionRef, voucher, member *firestore.DocumentRef, now time.Time) (voucherClaimResult, error) {
	var result voucherClaimResult
	err := fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		result = voucherClaimResult{}
		voucherSnap, err := tx.Get(voucher)
		if status.Code(err) == codes.NotFound {
			return errVoucherInvalid
		}
		if err != nil {
			return err
		}
		var v pointVoucher
		if err := voucherSnap.DataTo(&v); err != nil {
			return err
		}
		if v.CampaignID == "" || strings.Contains(v.CampaignID, "/") {
			return errVoucherInvalid
		}
		if v.UsedAt != nil {
			return errVoucherUsed
		}
		campaignSnap, err := tx.Get(campaigns.Doc(v.CampaignID))
		if status.Code(err) == codes.NotFound {
			return errVoucherInvalid
		}
		if err != nil {
			return err
		}
		var campaign voucherCampaign
		if err := campaignSnap.DataTo(&campaign); err != nil {
			return err
		}
		if !campaign.Enabled || campaign.Points <= 0 || campaign.Points > 100000 || !now.Before(campaign.EndsAt) {
			return errVoucherInvalid
		}
		memberSnap, err := tx.Get(member)
		if status.Code(err) == codes.NotFound {
			return errSurveyRegister
		}
		if err != nil {
			return err
		}
		var m memberDoc
		if err := memberSnap.DataTo(&m); err != nil {
			return err
		}
		if m.DeletedAt != nil {
			return errSurveyDeleted
		}
		if m.ConsentedAt == nil {
			return errSurveyConsent
		}
		log := member.Collection("point_logs").Doc(v.CampaignID)
		logSnap, err := tx.Get(log)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if logSnap != nil && logSnap.Exists() {
			return errVoucherDuplicate
		}
		result = voucherClaimResult{Point: m.Point + campaign.Points, Awarded: campaign.Points}
		if err := tx.Update(member, []firestore.Update{{Path: "point", Value: result.Point}}); err != nil {
			return err
		}
		if err := tx.Create(log, map[string]interface{}{"amount": campaign.Points, "source": v.CampaignID, "type": "voucher", "accumulate": false, "acquired_at": now, "expires_at": now.AddDate(1, 0, 0), "voucher_hash": voucher.ID}); err != nil {
			return err
		}
		return tx.Update(voucher, []firestore.Update{{Path: "used_at", Value: now}, {Path: "used_uid", Value: member.ID}})
	})
	return result, err
}
