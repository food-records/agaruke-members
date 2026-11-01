package qrcode

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/foodrecords/members-api/pkg/rank"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	errSerialInvalid   = errors.New("シリアルナンバーが無効です")
	errSerialUsed      = errors.New("このシリアルナンバーは既に使われています")
	errSerialExpired   = errors.New("このシリアルナンバーの受取期限が切れています")
	errSerialDuplicate = errors.New("この配布のポイントは受け取り済みです")
	errSerialRegister  = errors.New("MEMBER_REGISTRATION_REQUIRED")
	errSerialConsent   = errors.New("CAMPAIGN_CONSENT_REQUIRED")
	errSerialDeleted   = errors.New("ACCOUNT_DELETED")
)

var serialCampaignID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,80}$`)

// redeemOnceSerial reads the serial, member and campaign receipt before writing
// any of them. Firestore retries the whole transaction if a concurrent claim
// changes the serial, so exactly one claimant can receive its points.
func redeemOnceSerial(ctx context.Context, fs *firestore.Client, code, uid string, now time.Time) (PostResp, error) {
	serial := config.DataCollection(fs, "serials").Doc(code)
	member := config.DataCollection(fs, "members").Doc(uid)
	var result PostResp
	err := fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		result = PostResp{}
		serialSnap, err := tx.Get(serial)
		if status.Code(err) == codes.NotFound {
			return errSerialInvalid
		}
		if err != nil {
			return err
		}
		var s serialDoc
		if err := serialSnap.DataTo(&s); err != nil {
			return err
		}
		if s.Type == "recurring" || s.Point <= 0 || s.Point > 100000 {
			return errSerialInvalid
		}
		if s.Used {
			return errSerialUsed
		}
		if s.ExpiresAt != nil && !now.Before(*s.ExpiresAt) {
			return errSerialExpired
		}
		if s.CampaignID != "" && !serialCampaignID.MatchString(s.CampaignID) {
			return errSerialInvalid
		}
		memberSnap, err := tx.Get(member)
		if status.Code(err) == codes.NotFound {
			return errSerialRegister
		}
		if err != nil {
			return err
		}
		var m memberDoc
		if err := memberSnap.DataTo(&m); err != nil {
			return err
		}
		if m.DeletedAt != nil {
			return errSerialDeleted
		}
		if m.ConsentedAt == nil {
			return errSerialConsent
		}
		var log *firestore.DocumentRef
		if s.CampaignID == "" {
			log = member.Collection("point_logs").NewDoc()
		} else {
			log = member.Collection("point_logs").Doc(s.CampaignID)
			logSnap, err := tx.Get(log)
			if err != nil && status.Code(err) != codes.NotFound {
				return err
			}
			if logSnap != nil && logSnap.Exists() {
				return errSerialDuplicate
			}
		}
		accumulate := serialAccumulate(s)
		newTotal := m.TotalEarnedPoint
		if _, exists := memberSnap.Data()["total_earned_point"]; !exists {
			newTotal = effectiveTotalEarned(m)
		}
		if shouldReset(m) {
			newTotal = 0
		}
		if accumulate {
			newTotal += s.Point
		}
		newPoint := m.Point + s.Point
		updates := []firestore.Update{{Path: "point", Value: newPoint}, {Path: "total_earned_point", Value: newTotal}}
		if accumulate {
			updates = append(updates, firestore.Update{Path: "last_accumulated_at", Value: now})
		}
		if err := tx.Update(member, updates); err != nil {
			return err
		}
		if err := tx.Update(serial, []firestore.Update{{Path: "used", Value: true}, {Path: "used_id", Value: fmt.Sprintf("%06d", m.Number)}, {Path: "used_at", Value: now}, {Path: "used_uid", Value: uid}}); err != nil {
			return err
		}
		if err := tx.Create(log, pointLogDoc{Amount: s.Point, Source: "serial_once", Accumulate: accumulate, AcquiredAt: now, ExpiresAt: now.AddDate(1, 0, 0), SerialCode: code}); err != nil {
			return err
		}
		ri := rank.Calc(newTotal)
		result = PostResp{Number: fmt.Sprintf("FR%06d", m.Number), GetPoint: s.Point, Point: newPoint, TotalEarnedPoint: newTotal, Rank: ri.Current, NextRank: ri.Next, NextRankPoint: ri.NextThreshold}
		return nil
	})
	return result, err
}
