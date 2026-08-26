package domain

import "business-central-backend/internal/auth/domain/entities"

func ValidateCredentials(email, password string) error {
	return entities.ValidateLogin(email, password)
}
