package application

import (
	"context"

	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/media"
	"business-central-backend/internal/services/application/dto"
	"business-central-backend/internal/services/ports/inbound"
	"business-central-backend/internal/services/ports/outbound"
)

type Service struct{ outbound.Repository }

func NewService(repository outbound.Repository) *Service { return &Service{Repository: repository} }

func (s *Service) CreateRepairTicket(ctx context.Context, claims *authdto.Claims, request dto.CreateRepairTicketRequest) (dto.RepairTicket, error) {
	for index := range request.Images {
		if err := normalizeRepairImage(&request.Images[index]); err != nil {
			return dto.RepairTicket{}, err
		}
	}
	return s.Repository.CreateRepairTicket(ctx, claims, request)
}

func (s *Service) CreateRepairImage(ctx context.Context, claims *authdto.Claims, orderID string, request dto.RepairImageRequest) (dto.RepairImage, error) {
	if err := normalizeRepairImage(&request); err != nil {
		return dto.RepairImage{}, err
	}
	return s.Repository.CreateRepairImage(ctx, claims, orderID, request)
}

func normalizeRepairImage(request *dto.RepairImageRequest) error {
	if request.ImageURL == "" {
		if request.DataBase64 != "" {
			request.SourceType = "LEGACY_BASE64"
		}
		return nil
	}
	image, err := media.NormalizeURL(media.URLRequest{ImageURL: request.ImageURL, SourceType: request.SourceType}, true)
	if err != nil {
		return err
	}
	request.ImageURL = image.ImageURL
	request.SourceType = image.SourceType
	request.DataBase64 = ""
	return nil
}

var _ inbound.Services = (*Service)(nil)
