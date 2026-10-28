package kiosk

import (
	"cloud.google.com/go/firestore"
	"context"
	"os"
	"testing"
	"time"
)

func TestMemberLinkSignalAtomicEmulator(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("emulator required")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-kiosk-member-signal")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	token := client.Collection("tokens").Doc("test")
	signal := client.Collection("kiosk_member_link_signals").Doc("test")
	expiry := time.Now().Add(time.Minute)
	_, err = signal.Set(ctx, map[string]interface{}{"auth_uid": "kiosk", "linked": false, "expires_at": expiry})
	if err != nil {
		t.Fatal(err)
	}
	link := memberTokenDoc{CheckoutID: "checkout", ExpiresAt: expiry, UserID: "private-line-id", LinkedAt: time.Now()}
	err = client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		if err := writeMemberLink(tx, token, signal, link); err != nil {
			return err
		}
		return context.Canceled
	})
	if err == nil {
		t.Fatal("expected abort")
	}
	snap, err := signal.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["linked"] != false {
		t.Fatal("aborted notification published")
	}
	err = client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		return writeMemberLink(tx, token, signal, link)
	})
	if err != nil {
		t.Fatal(err)
	}
	snap, err = signal.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["linked"] != true || snap.Data()["auth_uid"] != "kiosk" || len(snap.Data()) != 3 {
		t.Fatal("signal leaked fields or lost scope", snap.Data())
	}
	stored, err := token.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Data()["user_id"] != "private-line-id" {
		t.Fatal("link not committed")
	}
}
