package domain

import entities "business-central-backend/internal/pos/domain/entities"

func CanTransitionSession(status string) error {
	_, err := entities.NewSession(status)
	return err
}
