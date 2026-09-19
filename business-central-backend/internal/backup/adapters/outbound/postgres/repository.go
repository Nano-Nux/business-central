package postgres

import (
	"context"
	"errors"
	"fmt"

	"business-central-backend/internal/backup/domain"
	"business-central-backend/internal/backup/ports/outbound"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

var _ outbound.Repository = (*Repository)(nil)

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Save(ctx context.Context, b domain.MerchantBackup) error {
	query := `
		INSERT INTO merchant_backups (id, merchant_id, device_id, file_path, file_size_bytes, sha256_checksum, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := r.db.Exec(ctx, query, b.ID, b.MerchantID, b.DeviceID, b.FilePath, b.FileSizeBytes, b.SHA256Checksum, b.CreatedAt)
	if err != nil {
		return fmt.Errorf("save backup: %w", err)
	}
	return nil
}

func (r *Repository) List(ctx context.Context, merchantID string) ([]domain.MerchantBackup, error) {
	query := `
		SELECT id, merchant_id, device_id, file_path, file_size_bytes, sha256_checksum, created_at
		FROM merchant_backups
		WHERE merchant_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, merchantID)
	if err != nil {
		return nil, fmt.Errorf("list backups: %w", err)
	}
	defer rows.Close()

	var backups []domain.MerchantBackup
	for rows.Next() {
		var b domain.MerchantBackup
		if err := rows.Scan(&b.ID, &b.MerchantID, &b.DeviceID, &b.FilePath, &b.FileSizeBytes, &b.SHA256Checksum, &b.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan backup: %w", err)
		}
		backups = append(backups, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate backups: %w", err)
	}
	return backups, nil
}

func (r *Repository) GetLatest(ctx context.Context, merchantID string) (*domain.MerchantBackup, error) {
	query := `
		SELECT id, merchant_id, device_id, file_path, file_size_bytes, sha256_checksum, created_at
		FROM merchant_backups
		WHERE merchant_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	var b domain.MerchantBackup
	err := r.db.QueryRow(ctx, query, merchantID).Scan(
		&b.ID, &b.MerchantID, &b.DeviceID, &b.FilePath, &b.FileSizeBytes, &b.SHA256Checksum, &b.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrBackupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get latest backup: %w", err)
	}
	return &b, nil
}

func (r *Repository) GetByID(ctx context.Context, merchantID, backupID string) (*domain.MerchantBackup, error) {
	query := `
		SELECT id, merchant_id, device_id, file_path, file_size_bytes, sha256_checksum, created_at
		FROM merchant_backups
		WHERE merchant_id = $1 AND id = $2
	`
	var b domain.MerchantBackup
	err := r.db.QueryRow(ctx, query, merchantID, backupID).Scan(
		&b.ID, &b.MerchantID, &b.DeviceID, &b.FilePath, &b.FileSizeBytes, &b.SHA256Checksum, &b.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrBackupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get backup by id: %w", err)
	}
	return &b, nil
}

func (r *Repository) PruneOldBackups(ctx context.Context, merchantID string, keepCount int) ([]string, error) {
	if keepCount <= 0 {
		keepCount = 7
	}
	// Select backups to delete (all rows beyond the latest keepCount)
	querySelect := `
		SELECT id, file_path
		FROM merchant_backups
		WHERE merchant_id = $1
		ORDER BY created_at DESC
		OFFSET $2
	`
	rows, err := r.db.Query(ctx, querySelect, merchantID, keepCount)
	if err != nil {
		return nil, fmt.Errorf("select old backups to prune: %w", err)
	}
	defer rows.Close()

	var deleteIDs []string
	var filePaths []string
	for rows.Next() {
		var id, path string
		if err := rows.Scan(&id, &path); err != nil {
			return nil, fmt.Errorf("scan prune backup: %w", err)
		}
		deleteIDs = append(deleteIDs, id)
		filePaths = append(filePaths, path)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate prune backups: %w", err)
	}

	if len(deleteIDs) == 0 {
		return nil, nil
	}

	deleteQuery := `
		DELETE FROM merchant_backups
		WHERE merchant_id = $1 AND id = ANY($2)
	`
	if _, err := r.db.Exec(ctx, deleteQuery, merchantID, deleteIDs); err != nil {
		return nil, fmt.Errorf("delete pruned backup rows: %w", err)
	}

	return filePaths, nil
}
