package application

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestCredentialsAreAuthenticatedAndContextBound(t *testing.T) {
	s := &Service{EncryptionKey: []byte(strings.Repeat("k", 32))}
	encrypted, e := s.seal("private-refresh")
	if e != nil {
		t.Fatal(e)
	}
	plain, e := s.open(encrypted)
	if e != nil || plain != "private-refresh" {
		t.Fatalf("round trip: %s %v", plain, e)
	}
	b, e := base64.RawURLEncoding.DecodeString(encrypted)
	if e != nil {
		t.Fatal(e)
	}
	b[len(b)-1] ^= 1
	if _, e = s.open(base64.RawURLEncoding.EncodeToString(b)); e == nil {
		t.Fatal("tampered ciphertext accepted")
	}
	s.EncryptionKey = []byte(strings.Repeat("z", 32))
	if _, e = s.open(encrypted); e == nil {
		t.Fatal("wrong key accepted")
	}
	if _, e = s.open("invalid"); e == nil {
		t.Fatal("malformed credential accepted")
	}
}
