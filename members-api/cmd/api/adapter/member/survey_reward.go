package member

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/presenter"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const surveyRewardID = "agaruke-2026-survey-500"
const surveyRewardPoints = 500

var (
	errSurveyUnavailable = errors.New("SURVEY_REWARD_UNAVAILABLE")
	errSurveyIneligible  = errors.New("SURVEY_REWARD_NOT_ELIGIBLE")
	errSurveyRegister    = errors.New("MEMBER_REGISTRATION_REQUIRED")
	errSurveyConsent     = errors.New("CAMPAIGN_CONSENT_REQUIRED")
	errSurveyDeleted     = errors.New("ACCOUNT_DELETED")
)

type surveyCampaign struct {
	Enabled bool      `firestore:"enabled"`
	EndsAt  time.Time `firestore:"ends_at"`
}

type surveyEligibility struct {
	Eligible  bool       `firestore:"eligible"`
	ClaimedAt *time.Time `firestore:"claimed_at,omitempty"`
}

type surveyClaimResult struct {
	Point          int  `json:"point"`
	Awarded        int  `json:"awarded"`
	AlreadyClaimed bool `json:"already_claimed"`
}

func (h handler) ClaimSurveyReward(w http.ResponseWriter, r *http.Request) {
	// A URL or request body never identifies the recipient. LINE verifies the
	// bearer token and supplies the UID used for the eligibility lookup.
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	profile, err := getProfile(token)
	if err != nil || profile.UserID == "" {
		presenter.Forbidden(w, "INVALID_TOKEN")
		return
	}
	campaign := config.OrganizationRef(h.fs).Collection("point_campaigns").Doc(surveyRewardID)
	member := config.DataCollection(h.fs, "members").Doc(profile.UserID)
	result, err := claimSurveyReward(r.Context(), h.fs, campaign, member, profile.UserID, time.Now().UTC())
	switch {
	case err == nil:
		presenter.EncodeWithMessage(w, result)
	case errors.Is(err, errSurveyIneligible), errors.Is(err, errSurveyDeleted):
		presenter.Forbidden(w, err.Error())
	case errors.Is(err, errSurveyRegister), errors.Is(err, errSurveyConsent), errors.Is(err, errSurveyUnavailable):
		presenter.BadRequest(w, err.Error())
	default:
		presenter.Error(w, err)
	}
}

func claimSurveyReward(ctx context.Context, fs *firestore.Client, campaign, member *firestore.DocumentRef, uid string, now time.Time) (surveyClaimResult, error) {
	var result surveyClaimResult
	eligible := campaign.Collection("eligible").Doc(uid)
	log := member.Collection("point_logs").Doc(surveyRewardID)
	err := fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		result = surveyClaimResult{}
		campaignSnap, err := tx.Get(campaign)
		if status.Code(err) == codes.NotFound {
			return errSurveyUnavailable
		}
		if err != nil {
			return err
		}
		var settings surveyCampaign
		if err := campaignSnap.DataTo(&settings); err != nil {
			return err
		}
		if !settings.Enabled || settings.EndsAt.IsZero() || !now.Before(settings.EndsAt) {
			return errSurveyUnavailable
		}

		eligibleSnap, err := tx.Get(eligible)
		if status.Code(err) == codes.NotFound {
			return errSurveyIneligible
		}
		if err != nil {
			return err
		}
		var allowed surveyEligibility
		if err := eligibleSnap.DataTo(&allowed); err != nil {
			return err
		}
		if !allowed.Eligible {
			return errSurveyIneligible
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

		logSnap, err := tx.Get(log)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		result.Point = m.Point
		if allowed.ClaimedAt != nil || (logSnap != nil && logSnap.Exists()) {
			result.AlreadyClaimed = true
			if allowed.ClaimedAt == nil {
				return tx.Update(eligible, []firestore.Update{{Path: "claimed_at", Value: now}})
			}
			return nil
		}
		result.Point += surveyRewardPoints
		result.Awarded = surveyRewardPoints
		if err := tx.Update(member, []firestore.Update{{Path: "point", Value: result.Point}}); err != nil {
			return err
		}
		if err := tx.Create(log, map[string]interface{}{
			"amount": surveyRewardPoints, "source": surveyRewardID, "type": "campaign",
			"accumulate": false, "acquired_at": now, "expires_at": now.AddDate(1, 0, 0),
		}); err != nil {
			return err
		}
		return tx.Update(eligible, []firestore.Update{{Path: "claimed_at", Value: now}})
	})
	return result, err
}
