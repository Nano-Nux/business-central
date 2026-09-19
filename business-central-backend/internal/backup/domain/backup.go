package domain

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalidMerchantID = errors.New("merchant ID is required")
	ErrInvalidDeviceID   = errors.New("device ID is required")
	ErrInvalidChecksum   = errors.New("SHA256 checksum is required and must be 64 hex characters")
	ErrFileTooLarge       = errors.New("backup file exceeds maximum allowed size of 25MB")
	ErrEmptyBackupFile   = errors.New("backup file cannot be empty")
	ErrBackupNotFound    = errors.New("backup record not found")
)

const MaxBackupSizeBytes = 25 * 1024 * 1024 // 25 MB

type MerchantBackup struct {
	ID             string    `json:"id"`
	MerchantID     string    `json:"merchant_id"`
	DeviceID       string    `json:"device_id"`
	FilePath       string    `json:"file_path"`
	FileSizeBytes  int64     `json:"file_size_bytes"`
	SHA256Checksum string    `json:"sha256_checksum"`
	CreatedAt      time.Time `json:"created_at"`
}

func ValidateBackupInput(merchantID, deviceID, checksum string, sizeBytes int64) error {
	if strings.TrimSpace(merchantID) == "" {
		return ErrInvalidMerchantID
	}
	if strings.TrimSpace(deviceID) == "" {
		return ErrInvalidDeviceID
	}
	checksum = strings.TrimSpace(checksum)
	if len(checksum) != 64 {
		return ErrInvalidChecksum
	}
	if sizeBytes <= 0 {
		return ErrEmptyBackupFile
	}
	if sizeBytes > MaxBackupSizeBytes {
		return ErrFileTooLarge
	}
	return nil
}
