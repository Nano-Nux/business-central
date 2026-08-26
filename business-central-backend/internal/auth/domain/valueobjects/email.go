package valueobjects

import (
	"business-central-backend/internal/auth/domain/entities"
)

type Email string

func NewEmail(value string) (Email, error) {
	normalized, err := entities.NormalizeEmail(value)
	return Email(normalized), err
}

func (e Email) String() string { return string(e) }
