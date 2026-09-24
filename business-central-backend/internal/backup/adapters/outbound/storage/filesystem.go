package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"business-central-backend/internal/backup/ports/outbound"
)

type FileSystemStorage struct {
	baseDir string
}

var _ outbound.Storage = (*FileSystemStorage)(nil)

func NewFileSystemStorage(baseDir string) (*FileSystemStorage, error) {
	if strings.TrimSpace(baseDir) == "" {
		baseDir = "./data/backups"
	}
	abs, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve backups base dir: %w", err)
	}
	if err := os.MkdirAll(abs, 0755); err != nil {
		return nil, fmt.Errorf("create backups base dir: %w", err)
	}
	return &FileSystemStorage{baseDir: abs}, nil
}

func (s *FileSystemStorage) resolveSafePath(relativePath string) (string, error) {
	cleanRel := filepath.Clean(relativePath)
	if strings.HasPrefix(cleanRel, "..") || filepath.IsAbs(cleanRel) {
		return "", fmt.Errorf("invalid relative path: %s", relativePath)
	}
	full := filepath.Join(s.baseDir, cleanRel)
	return full, nil
}

func (s *FileSystemStorage) Store(ctx context.Context, relativePath string, reader io.Reader) error {
	fullPath, err := s.resolveSafePath(relativePath)
	if err != nil {
		return err
	}
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create backup dir: %w", err)
	}
	file, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("create backup file: %w", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, reader); err != nil {
		_ = os.Remove(fullPath)
		return fmt.Errorf("write backup content: %w", err)
	}
	return nil
}

func (s *FileSystemStorage) Open(ctx context.Context, relativePath string) (io.ReadCloser, error) {
	fullPath, err := s.resolveSafePath(relativePath)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(fullPath)
	if err != nil {
		return nil, fmt.Errorf("open backup file: %w", err)
	}
	return file, nil
}

func (s *FileSystemStorage) Delete(ctx context.Context, relativePath string) error {
	fullPath, err := s.resolveSafePath(relativePath)
	if err != nil {
		return err
	}
	if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete backup file: %w", err)
	}
	return nil
}
