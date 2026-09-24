package application

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"business-central-backend/internal/backup/domain"
	"business-central-backend/internal/backup/ports/inbound"
	"business-central-backend/internal/backup/ports/outbound"
	"github.com/google/uuid"
)

type Service struct {
	repo    outbound.Repository
	storage outbound.Storage
}

var _ inbound.BackupService = (*Service)(nil)

func NewService(repo outbound.Repository, storage outbound.Storage) *Service {
	return &Service{
		repo:    repo,
		storage: storage,
	}
}

func (s *Service) UploadBackup(
	ctx context.Context,
	merchantID, deviceID, expectedChecksum string,
	size int64,
	reader io.Reader,
) (*domain.MerchantBackup, error) {
	merchantID = strings.TrimSpace(merchantID)
	deviceID = strings.TrimSpace(deviceID)
	expectedChecksum = strings.ToLower(strings.TrimSpace(expectedChecksum))

	if err := domain.ValidateBackupInput(merchantID, deviceID, expectedChecksum, size); err != nil {
		return nil, err
	}

	backupID := uuid.NewString()
	now := time.Now().UTC()
	relPath := filepath.Join(merchantID, fmt.Sprintf("%d_%s.zip", now.Unix(), backupID))

	// Buffer or compute sha256 while streaming to storage
	hasher := sha256.New()
	teeReader := io.TeeReader(reader, hasher)

	// In case of error writing to storage, tee will stop
	var buf bytes.Buffer
	written, err := io.Copy(&buf, teeReader)
	if err != nil {
		return nil, fmt.Errorf("read backup payload: %w", err)
	}

	actualChecksum := hex.EncodeToString(hasher.Sum(nil))
	if !strings.EqualFold(actualChecksum, expectedChecksum) {
		return nil, fmt.Errorf("checksum mismatch: expected %s, got %s", expectedChecksum, actualChecksum)
	}

	if err := s.storage.Store(ctx, relPath, &buf); err != nil {
		return nil, fmt.Errorf("store backup file: %w", err)
	}

	backup := domain.MerchantBackup{
		ID:             backupID,
		MerchantID:     merchantID,
		DeviceID:       deviceID,
		FilePath:       relPath,
		FileSizeBytes:  written,
		SHA256Checksum: actualChecksum,
		CreatedAt:      now,
	}

	if err := s.repo.Save(ctx, backup); err != nil {
		_ = s.storage.Delete(ctx, relPath)
		return nil, fmt.Errorf("save backup metadata: %w", err)
	}

	// Automatic retention pruning: keep latest 7 backups per merchant
	prunedPaths, pruneErr := s.repo.PruneOldBackups(ctx, merchantID, 7)
	if pruneErr == nil {
		for _, oldPath := range prunedPaths {
			_ = s.storage.Delete(ctx, oldPath)
		}
	}

	return &backup, nil
}

func (s *Service) ListBackups(ctx context.Context, merchantID string) ([]domain.MerchantBackup, error) {
	merchantID = strings.TrimSpace(merchantID)
	if merchantID == "" {
		return nil, domain.ErrInvalidMerchantID
	}
	return s.repo.List(ctx, merchantID)
}

func (s *Service) GetLatestBackup(ctx context.Context, merchantID string) (*domain.MerchantBackup, io.ReadCloser, error) {
	merchantID = strings.TrimSpace(merchantID)
	if merchantID == "" {
		return nil, nil, domain.ErrInvalidMerchantID
	}
	backup, err := s.repo.GetLatest(ctx, merchantID)
	if err != nil {
		return nil, nil, err
	}
	file, err := s.storage.Open(ctx, backup.FilePath)
	if err != nil {
		return nil, nil, fmt.Errorf("open latest backup: %w", err)
	}
	return backup, file, nil
}

func (s *Service) GetBackupFile(ctx context.Context, merchantID, backupID string) (*domain.MerchantBackup, io.ReadCloser, error) {
	merchantID = strings.TrimSpace(merchantID)
	backupID = strings.TrimSpace(backupID)
	if merchantID == "" || backupID == "" {
		return nil, nil, domain.ErrBackupNotFound
	}
	backup, err := s.repo.GetByID(ctx, merchantID, backupID)
	if err != nil {
		return nil, nil, err
	}
	file, err := s.storage.Open(ctx, backup.FilePath)
	if err != nil {
		return nil, nil, fmt.Errorf("open backup file: %w", err)
	}
	return backup, file, nil
}
