package inbound

import (
	"context"
	"io"

	"business-central-backend/internal/backup/domain"
)

type BackupService interface {
	UploadBackup(ctx context.Context, merchantID, deviceID, checksum string, size int64, reader io.Reader) (*domain.MerchantBackup, error)
	ListBackups(ctx context.Context, merchantID string) ([]domain.MerchantBackup, error)
	GetLatestBackup(ctx context.Context, merchantID string) (*domain.MerchantBackup, io.ReadCloser, error)
	GetBackupFile(ctx context.Context, merchantID, backupID string) (*domain.MerchantBackup, io.ReadCloser, error)
}
