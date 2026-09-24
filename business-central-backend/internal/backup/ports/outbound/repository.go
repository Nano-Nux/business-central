package outbound

import (
	"context"
	"io"

	"business-central-backend/internal/backup/domain"
)

type Repository interface {
	Save(ctx context.Context, backup domain.MerchantBackup) error
	List(ctx context.Context, merchantID string) ([]domain.MerchantBackup, error)
	GetLatest(ctx context.Context, merchantID string) (*domain.MerchantBackup, error)
	GetByID(ctx context.Context, merchantID, backupID string) (*domain.MerchantBackup, error)
	PruneOldBackups(ctx context.Context, merchantID string, keepCount int) ([]string, error)
}

type Storage interface {
	Store(ctx context.Context, relativePath string, reader io.Reader) error
	Open(ctx context.Context, relativePath string) (io.ReadCloser, error)
	Delete(ctx context.Context, relativePath string) error
}
