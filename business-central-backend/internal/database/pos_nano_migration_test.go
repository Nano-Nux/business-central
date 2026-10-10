package database

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestConfiguredDatabasePOSNanoMigration(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 and DATABASE_URL for PostgreSQL migration acceptance")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	// A temporary table shadows the real merchant table on this connection.
	// The test never migrates or changes an existing tenant.
	_, err = conn.Exec(ctx, `CREATE TEMP TABLE merchants (
        id int GENERATED ALWAYS AS IDENTITY,
        pos_complexity_level varchar(10) NOT NULL DEFAULT 'SIMPLE'
            CONSTRAINT merchants_pos_complexity_level_check CHECK (pos_complexity_level IN ('MINI','SIMPLE','COMPLEX'))
    ); INSERT INTO merchants(pos_complexity_level) VALUES ('MINI'),('SIMPLE'),('COMPLEX');`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = conn.Exec(ctx, posNanoMode); err != nil {
		t.Fatal(err)
	}
	var modes string
	if err = conn.QueryRow(ctx, `SELECT string_agg(pos_complexity_level, ',' ORDER BY id) FROM merchants`).Scan(&modes); err != nil || modes != "MINI,SIMPLE,COMPLEX" {
		t.Fatalf("existing modes changed: %q, %v", modes, err)
	}
	var mode string
	if err = conn.QueryRow(ctx, `INSERT INTO merchants DEFAULT VALUES RETURNING pos_complexity_level`).Scan(&mode); err != nil || mode != "NANO" {
		t.Fatalf("new merchant default = %q, %v", mode, err)
	}
	if _, err = conn.Exec(ctx, `UPDATE merchants SET pos_complexity_level='NANO' WHERE id=1`); err != nil {
		t.Fatal(err)
	}
	if _, err = conn.Exec(ctx, `INSERT INTO merchants(pos_complexity_level) VALUES ('INVALID')`); err == nil {
		t.Fatal("invalid POS mode accepted")
	}
}
