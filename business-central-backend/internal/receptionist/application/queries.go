package application

import (
	"context"

	"business-central-backend/internal/receptionist/domain"
)

// These platform queries are exposed only through the administrator HTTP group.
// Public reads must use Get, which validates the conversation capability first.
func (s *Service) ListConversations(ctx context.Context, limit, offset int) ([]domain.Conversation, int, error) {
	return s.Repo.ListConversations(ctx, limit, offset)
}
func (s *Service) ConversationDetail(ctx context.Context, id string) (domain.Conversation, error) {
	return s.Repo.Conversation(ctx, id)
}
func (s *Service) ListBookings(ctx context.Context, limit, offset int, status string) ([]domain.Booking, int, error) {
	return s.Repo.ListBookings(ctx, limit, offset, status)
}
func (s *Service) BookingDetail(ctx context.Context, id string) (domain.Booking, error) {
	return s.Repo.Booking(ctx, id)
}
