package member

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/foodrecords/members-api/pkg/config"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func statusNotFound(err error) bool { return status.Code(err) == codes.NotFound }

func customerRefs(fs *firestore.Client, lineUserID string) (*firestore.DocumentRef, *firestore.DocumentRef, string) {
	provider := os.Getenv("LINE_PROVIDER_ID")
	if provider == "" || !config.OrganizationDataEnabled() {
		return nil, nil, ""
	}
	org := config.OrganizationRef(fs)
	id := uuid.NewSHA1(uuid.NameSpaceURL, []byte("orderec/customer/line/"+config.OrganizationUUID()+"/"+provider+"/"+lineUserID)).String()
	digest := sha256.Sum256([]byte("line/" + provider + "/" + lineUserID))
	return org.Collection("customers").Doc(id), org.Collection("customer_identities").Doc(hex.EncodeToString(digest[:])), id
}

func projectMember(ctx context.Context, fs *firestore.Client, lineUserID, name string) error {
	ref, identity, id := customerRefs(fs, lineUserID)
	if ref == nil {
		return nil
	}
	now := time.Now().UTC()
	return fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		identitySnap, err := tx.Get(identity)
		if err == nil {
			if existing, ok := identitySnap.Data()["customer_id"].(string); ok && existing != "" {
				id = existing
				ref = config.OrganizationRef(fs).Collection("customers").Doc(id)
			} else {
				return errors.New("customer identity missing target")
			}
		} else if !statusNotFound(err) {
			return err
		}
		snap, err := tx.Get(ref)
		if err != nil && !statusNotFound(err) {
			return err
		}
		if statusNotFound(err) && id != uuid.NewSHA1(uuid.NameSpaceURL, []byte("orderec/customer/line/"+config.OrganizationUUID()+"/"+os.Getenv("LINE_PROVIDER_ID")+"/"+lineUserID)).String() {
			return errors.New("linked customer missing")
		}
		data := map[string]interface{}{"id": id, "organization_uuid": config.OrganizationUUID(), "line_provider_id": os.Getenv("LINE_PROVIDER_ID"), "line_user_id": lineUserID, "has_member": true, "updated_at": now}
		if name != "" {
			data["display_name"] = name
		}
		if snap == nil || !snap.Exists() {
			data["friendship"] = "unknown"
			data["has_order"] = false
			data["created_at"] = now
		}
		if err := tx.Set(ref, data, firestore.MergeAll); err != nil {
			return err
		}
		return tx.Set(identity, map[string]interface{}{"customer_id": id, "kind": "line", "provider_id": os.Getenv("LINE_PROVIDER_ID"), "line_user_id": lineUserID})
	})
}

func unprojectMember(ctx context.Context, fs *firestore.Client, lineUserID string) error {
	ref, identity, _ := customerRefs(fs, lineUserID)
	if ref == nil {
		return nil
	}
	if snap, err := identity.Get(ctx); err == nil {
		if id, ok := snap.Data()["customer_id"].(string); ok && id != "" {
			ref = config.OrganizationRef(fs).Collection("customers").Doc(id)
		}
	} else if !statusNotFound(err) {
		return err
	}
	_, err := ref.Update(ctx, []firestore.Update{{Path: "has_member", Value: false}, {Path: "updated_at", Value: time.Now().UTC()}})
	if statusNotFound(err) {
		return nil
	}
	return err
}
