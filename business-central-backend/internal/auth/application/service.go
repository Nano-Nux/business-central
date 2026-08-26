// Package auth contains authentication and membership use cases.
package application

import (
	"context"
	"strings"

	"business-central-backend/internal/app"
	"business-central-backend/internal/auth/application/dto"
	identityentities "business-central-backend/internal/auth/domain/entities"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	authoutbound "business-central-backend/internal/auth/ports/outbound"
)

type Service struct {
	authoutbound.Repository
}

func NewService(port authoutbound.Repository) *Service {
	return &Service{Repository: port}
}

var _ authinbound.Authentication = (*Service)(nil)

func (s *Service) CreateBusinessType(ctx context.Context, claims *dto.Claims, request dto.CreateBusinessTypeRequest) (dto.BusinessType, error) {
	request.Code = strings.ToUpper(strings.TrimSpace(request.Code))
	request.Name = strings.TrimSpace(request.Name)
	request.Description = strings.TrimSpace(request.Description)
	if request.Code == "" || request.Name == "" {
		return dto.BusinessType{}, app.Validation("code and name are required.", nil)
	}
	return s.Repository.CreateBusinessType(ctx, claims, request)
}
func (s *Service) UpdateBusinessType(ctx context.Context, claims *dto.Claims, id string, request dto.UpdateBusinessTypeRequest) (dto.BusinessType, error) {
	if request.Name == nil && request.Description == nil && request.IsActive == nil {
		return dto.BusinessType{}, app.Validation("at least one field to update is required.", nil)
	}
	if request.Name != nil {
		value := strings.TrimSpace(*request.Name)
		if value == "" {
			return dto.BusinessType{}, app.Validation("name cannot be empty.", nil)
		}
		request.Name = &value
	}
	if request.Description != nil {
		value := strings.TrimSpace(*request.Description)
		request.Description = &value
	}
	return s.Repository.UpdateBusinessType(ctx, claims, id, request)
}

func (s *Service) Login(ctx context.Context, request dto.LoginRequest) (dto.Session, *app.Error) {
	if err := identityentities.ValidateLogin(request.Email, request.Password); err != nil {
		return dto.Session{}, app.Validation("Email and password are required.", map[string]any{"email": "required", "password": "required"})
	}
	request.Email = strings.ToLower(strings.TrimSpace(request.Email))
	return s.Repository.Login(ctx, request)
}

func (s *Service) CreateUser(ctx context.Context, claims *dto.Claims, request dto.CreateUserRequest) (dto.User, error) {
	if err := identityentities.ValidateUser(request.Email, request.Password, request.DisplayName); err != nil {
		return dto.User{}, app.Validation("Email, password, and display_name are required.", map[string]any{"email": "required", "password": "required", "display_name": "required"})
	}
	request.Email = strings.ToLower(strings.TrimSpace(request.Email))
	request.DisplayName = strings.TrimSpace(request.DisplayName)
	return s.Repository.CreateUser(ctx, claims, request)
}

func (s *Service) CreateMerchantUser(ctx context.Context, claims *dto.Claims, request dto.CreateMerchantUserRequest) (dto.MerchantUserProvisioning, error) {
	request.MerchantName = strings.TrimSpace(request.MerchantName)
	request.MerchantSlug = strings.ToLower(strings.TrimSpace(request.MerchantSlug))
	request.DefaultCurrencyCode = strings.ToUpper(strings.TrimSpace(request.DefaultCurrencyCode))
	request.Email = strings.ToLower(strings.TrimSpace(request.Email))
	request.DisplayName = strings.TrimSpace(request.DisplayName)
	if request.MerchantName == "" || request.MerchantSlug == "" || !validCurrencyCode(request.DefaultCurrencyCode) {
		return dto.MerchantUserProvisioning{}, app.Validation("merchant_name, merchant_slug, and a valid default_currency_code are required.", map[string]any{"merchant_name": "required", "merchant_slug": "required", "default_currency_code": "required"})
	}
	if err := identityentities.ValidateUser(request.Email, request.Password, request.DisplayName); err != nil {
		return dto.MerchantUserProvisioning{}, app.Validation("Email, password, and display_name are required.", map[string]any{"email": "required", "password": "required", "display_name": "required"})
	}
	return s.Repository.CreateMerchantUser(ctx, claims, request)
}

func (s *Service) CreateCurrency(ctx context.Context, claims *dto.Claims, request dto.CreateCurrencyRequest) (dto.Currency, error) {
	request.Code = strings.ToUpper(strings.TrimSpace(request.Code))
	request.Name = strings.TrimSpace(request.Name)
	if !validCurrencyCode(request.Code) {
		return dto.Currency{}, app.Validation("code must contain exactly three letters.", map[string]any{"code": "three-letter ISO-style code is required"})
	}
	if request.Name == "" {
		return dto.Currency{}, app.Validation("name is required.", map[string]any{"name": "required"})
	}
	if request.DecimalPlaces == nil || *request.DecimalPlaces < 0 || *request.DecimalPlaces > 6 {
		return dto.Currency{}, app.Validation("decimal_places must be a number between 0 and 6.", map[string]any{"decimal_places": "must be between 0 and 6"})
	}
	if request.Symbol != nil {
		value := strings.TrimSpace(*request.Symbol)
		request.Symbol = &value
	}
	return s.Repository.CreateCurrency(ctx, claims, request)
}

func (s *Service) UpdateCurrency(ctx context.Context, claims *dto.Claims, code string, request dto.UpdateCurrencyRequest) (dto.Currency, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if !validCurrencyCode(code) || (request.Name == nil && request.Symbol == nil && request.DecimalPlaces == nil) {
		return dto.Currency{}, app.Validation("a valid currency code and at least one field to update are required.", nil)
	}
	if request.Name != nil {
		value := strings.TrimSpace(*request.Name)
		if value == "" {
			return dto.Currency{}, app.Validation("name cannot be empty.", map[string]any{"name": "required"})
		}
		request.Name = &value
	}
	if request.Symbol != nil {
		value := strings.TrimSpace(*request.Symbol)
		request.Symbol = &value
	}
	if request.DecimalPlaces != nil && (*request.DecimalPlaces < 0 || *request.DecimalPlaces > 6) {
		return dto.Currency{}, app.Validation("decimal_places must be between 0 and 6.", map[string]any{"decimal_places": "must be between 0 and 6"})
	}
	return s.Repository.UpdateCurrency(ctx, claims, code, request)
}

func (s *Service) CreateRole(ctx context.Context, claims *dto.Claims, merchantID string, request dto.CreateRoleRequest) (dto.Role, error) {
	request.Code = strings.ToLower(strings.TrimSpace(request.Code))
	request.Name = strings.TrimSpace(request.Name)
	if err := identityentities.ValidateRole(request.Code, request.Name); err != nil {
		return dto.Role{}, app.Validation("Role code and name are required; code must use lowercase letters, numbers, dots, underscores, or hyphens.", map[string]any{"code": "invalid", "name": "required"})
	}
	request.PermissionCodes = normalizePermissionCodes(request.PermissionCodes)
	return s.Repository.CreateRole(ctx, claims, merchantID, request)
}

func (s *Service) UpdateRole(ctx context.Context, claims *dto.Claims, merchantID, roleID string, request dto.UpdateRoleRequest) (dto.Role, error) {
	if request.Code == nil && request.Name == nil && request.PermissionCodes == nil {
		return dto.Role{}, app.Validation("At least one role field is required.", nil)
	}
	if request.Code != nil {
		value := strings.ToLower(strings.TrimSpace(*request.Code))
		request.Code = &value
	}
	if request.Name != nil {
		value := strings.TrimSpace(*request.Name)
		request.Name = &value
	}
	if request.Code != nil || request.Name != nil {
		code := "valid"
		name := "valid"
		if request.Code != nil {
			code = *request.Code
		}
		if request.Name != nil {
			name = *request.Name
		}
		if err := identityentities.ValidateRole(code, name); err != nil {
			return dto.Role{}, app.Validation("Role code and name cannot be empty; code must use lowercase letters, numbers, dots, underscores, or hyphens.", nil)
		}
	}
	if request.PermissionCodes != nil {
		values := normalizePermissionCodes(*request.PermissionCodes)
		request.PermissionCodes = &values
	}
	return s.Repository.UpdateRole(ctx, claims, merchantID, roleID, request)
}

func normalizePermissionCodes(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func validCurrencyCode(code string) bool {
	if len(code) != 3 {
		return false
	}
	for _, character := range code {
		if character < 'A' || character > 'Z' {
			return false
		}
	}
	return true
}
