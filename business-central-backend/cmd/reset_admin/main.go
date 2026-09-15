package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"business-central-backend/internal/config"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func resetAdmin(ctx context.Context, pool *pgxpool.Pool, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || len(password) < 8 {
		return fmt.Errorf("email cannot be empty and password must be at least 8 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("failed to disable row security: %w", err)
	}

	var identityID string
	err = tx.QueryRow(ctx, `
		INSERT INTO user_identities (id, email, password_hash, is_active, failed_attempts, locked_until, updated_at)
		VALUES (gen_random_uuid(), $1, $2, true, 0, NULL, now())
		ON CONFLICT (lower(email)) DO UPDATE
		SET password_hash = EXCLUDED.password_hash,
		    is_active = true,
		    failed_attempts = 0,
		    locked_until = NULL,
		    updated_at = now()
		RETURNING id
	`, email, string(hash)).Scan(&identityID)
	if err != nil {
		return fmt.Errorf("failed to upsert user identity: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO platform_admin_identities (identity_id, is_super_admin, created_at)
		VALUES ($1, true, now())
		ON CONFLICT (identity_id) DO UPDATE
		SET is_super_admin = true
	`, identityID)
	if err != nil {
		return fmt.Errorf("failed to upsert platform admin identity: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	fmt.Printf("Successfully updated platform super admin: %s (ID: %s)\n", email, identityID)
	return nil
}

func main() {
	var emailFlag, passFlag, dbURLFlag string
	flag.StringVar(&emailFlag, "email", "", "Admin email address")
	flag.StringVar(&passFlag, "password", "", "Admin password")
	flag.StringVar(&dbURLFlag, "db", "", "Database URL")
	flag.Parse()

	// Load env if flags not fully provided
	cfg, _ := config.Load()

	dbURL := dbURLFlag
	if dbURL == "" {
		dbURL = cfg.DatabaseURL
	}
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required (pass via -db flag or .env)")
	}

	email := emailFlag
	if email == "" {
		email = cfg.AdminEmail
	}
	if email == "" {
		email = os.Getenv("ADMIN_EMAIL")
	}

	password := passFlag
	if password == "" {
		password = cfg.AdminPassword
	}
	if password == "" {
		password = os.Getenv("ADMIN_PASSWORD")
	}

	if email == "" || password == "" {
		log.Fatal("Email and password are required (pass via -email/-password flags or ADMIN_EMAIL/ADMIN_PASSWORD in .env)")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Ping failed: %v", err)
	}

	if err := resetAdmin(ctx, pool, email, password); err != nil {
		log.Fatalf("Reset failed: %v", err)
	}
}
