package application_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"testing"

	"business-central-backend/internal/backup/application"
	"business-central-backend/internal/backup/domain"
	backupstorage "business-central-backend/internal/backup/adapters/outbound/storage"
)

type mockRepository struct {
	backups    map[string][]domain.MerchantBackup
	savedCount int
}

func newMockRepository() *mockRepository {
	return &mockRepository{backups: make(map[string][]domain.MerchantBackup)}
}

func (m *mockRepository) Save(ctx context.Context, b domain.MerchantBackup) error {
	m.backups[b.MerchantID] = append([]domain.MerchantBackup{b}, m.backups[b.MerchantID]...)
	m.savedCount++
	return nil
}

func (m *mockRepository) List(ctx context.Context, merchantID string) ([]domain.MerchantBackup, error) {
	return m.backups[merchantID], nil
}

func (m *mockRepository) GetLatest(ctx context.Context, merchantID string) (*domain.MerchantBackup, error) {
	list := m.backups[merchantID]
	if len(list) == 0 {
		return nil, domain.ErrBackupNotFound
	}
	return &list[0], nil
}

func (m *mockRepository) GetByID(ctx context.Context, merchantID, backupID string) (*domain.MerchantBackup, error) {
	for _, b := range m.backups[merchantID] {
		if b.ID == backupID {
			return &b, nil
		}
	}
	return nil, domain.ErrBackupNotFound
}

func (m *mockRepository) PruneOldBackups(ctx context.Context, merchantID string, keepCount int) ([]string, error) {
	list := m.backups[merchantID]
	if len(list) <= keepCount {
		return nil, nil
	}
	pruned := list[keepCount:]
	m.backups[merchantID] = list[:keepCount]
	var paths []string
	for _, b := range pruned {
		paths = append(paths, b.FilePath)
	}
	return paths, nil
}

func TestBackupService_UploadAndRetrieve(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "backup_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := backupstorage.NewFileSystemStorage(tempDir)
	if err != nil {
		t.Fatal(err)
	}

	repo := newMockRepository()
	svc := application.NewService(repo, storage)

	payload := []byte("sqlite database backup content for test")
	h := sha256.New()
	h.Write(payload)
	checksum := hex.EncodeToString(h.Sum(nil))

	ctx := context.Background()
	merchantID := "merchant-123"
	deviceID := "device-abc"

	// 1. Upload
	backup, err := svc.UploadBackup(ctx, merchantID, deviceID, checksum, int64(len(payload)), bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("unexpected upload error: %v", err)
	}
	if backup.MerchantID != merchantID {
		t.Errorf("expected merchant %s, got %s", merchantID, backup.MerchantID)
	}
	if backup.FileSizeBytes != int64(len(payload)) {
		t.Errorf("expected size %d, got %d", len(payload), backup.FileSizeBytes)
	}

	// 2. List
	list, err := svc.ListBackups(ctx, merchantID)
	if err != nil {
		t.Fatalf("unexpected list error: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 backup, got %d", len(list))
	}

	// 3. GetLatest
	latest, reader, err := svc.GetLatestBackup(ctx, merchantID)
	if err != nil {
		t.Fatalf("unexpected get latest error: %v", err)
	}
	defer reader.Close()

	if latest.ID != backup.ID {
		t.Errorf("expected ID %s, got %s", backup.ID, latest.ID)
	}
	content, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read content: %v", err)
	}
	if string(content) != string(payload) {
		t.Errorf("expected content %q, got %q", string(payload), string(content))
	}

	// 4. Checksum mismatch test
	_, err = svc.UploadBackup(ctx, merchantID, deviceID, "0000000000000000000000000000000000000000000000000000000000000000", int64(len(payload)), bytes.NewReader(payload))
	if err == nil {
		t.Error("expected checksum mismatch error, got nil")
	}

	// 5. Retention pruning test: upload 8 more backups, keepCount is 7
	for i := 0; i < 8; i++ {
		p := []byte(filepath.Join("backup", string(rune('a'+i))))
		sh := sha256.New()
		sh.Write(p)
		cs := hex.EncodeToString(sh.Sum(nil))
		_, err := svc.UploadBackup(ctx, merchantID, deviceID, cs, int64(len(p)), bytes.NewReader(p))
		if err != nil {
			t.Fatalf("prune upload %d error: %v", i, err)
		}
	}
	finalList, err := svc.ListBackups(ctx, merchantID)
	if err != nil {
		t.Fatal(err)
	}
	if len(finalList) != 7 {
		t.Errorf("expected exactly 7 backups retained, got %d", len(finalList))
	}
}
