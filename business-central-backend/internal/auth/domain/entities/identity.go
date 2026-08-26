package entities

import (
	"errors"
	"net/mail"
	"strings"
)

var ErrInvalidCredentials = errors.New("email and password are required")
var ErrInvalidUser = errors.New("email, password, and display_name are required")

func NormalizeEmail(value string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(value))
	if email == "" {
		return "", ErrInvalidCredentials
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return "", errors.New("email must be valid")
	}
	return email, nil
}

func ValidateLogin(email, password string) error {
	if strings.TrimSpace(email) == "" || password == "" {
		return ErrInvalidCredentials
	}
	return nil
}

func ValidateUser(email, password, displayName string) error {
	if strings.TrimSpace(email) == "" || password == "" || strings.TrimSpace(displayName) == "" {
		return ErrInvalidUser
	}
	return nil
}
