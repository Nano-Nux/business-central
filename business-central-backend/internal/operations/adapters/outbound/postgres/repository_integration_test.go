package postgres

import (
	"context"
	"os"
	"testing"
	"time"

	authdto "business-central-backend/internal/auth/application/dto"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestConfiguredDatabaseStorageProjectionQuery(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 to validate the configured PostgreSQL database")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("DATABASE_URL is required when RUN_DB_TESTS=1")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	claims := &authdto.Claims{
		IdentityID:   uuid.NewString(),
		MerchantID:   uuid.NewString(),
		MembershipID: uuid.NewString(),
	}
	items, err := NewService(pool).ListStorage(ctx, claims)
	if err != nil {
		t.Fatalf("storage projection query failed: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("unknown tenant returned %d storage rows", len(items))
	}
}
