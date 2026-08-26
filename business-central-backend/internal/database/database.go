package database

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Open(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	poolConfig.MaxConns = 10
	poolConfig.MinConns = 1
	poolConfig.MaxConnIdleTime = 5 * time.Minute
	// PostgreSQL stores timestamptz as an absolute instant, but renders it
	// using the connection timezone. Keep all backend reads and writes in UTC.
	poolConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, `SET TIME ZONE 'UTC'`)
		return err
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("open database pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

func HasCoreSchema(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.user_identities') IS NOT NULL AND to_regclass('public.user_memberships') IS NOT NULL`).Scan(&exists); err != nil {
		return false, fmt.Errorf("check database schema: %w", err)
	}
	return exists, nil
}

func ApplySchema(ctx context.Context, pool *pgxpool.Pool, path string) error {
	schema, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read schema file: %w", err)
	}
	if _, err := pool.Exec(ctx, string(schema)); err != nil {
		return fmt.Errorf("apply schema file: %w", err)
	}
	return nil
}
