package outbound

import (
	"context"

	"business-central-backend/internal/app"
	"business-central-backend/internal/auth/application/dto"
)

// Repository is the authentication and membership persistence port.
// Token issuance is included because the current identity aggregate owns the
// refresh-token lifecycle.
type Repository interface {
	ListBusinessTypes(context.Context) ([]dto.BusinessType, error)
	GetBusinessType(context.Context, string) (dto.BusinessType, error)
	CreateBusinessType(context.Context, *dto.Claims, dto.CreateBusinessTypeRequest) (dto.BusinessType, error)
	UpdateBusinessType(context.Context, *dto.Claims, string, dto.UpdateBusinessTypeRequest) (dto.BusinessType, error)
	DeleteBusinessType(context.Context, *dto.Claims, string) error
	ListCurrencies(context.Context) ([]dto.Currency, error)
	GetCurrency(context.Context, string) (dto.Currency, error)
	CreateCurrency(context.Context, *dto.Claims, dto.CreateCurrencyRequest) (dto.Currency, error)
	UpdateCurrency(context.Context, *dto.Claims, string, dto.UpdateCurrencyRequest) (dto.Currency, error)
	DeleteCurrency(context.Context, *dto.Claims, string) error
	Login(context.Context, dto.LoginRequest) (dto.Session, *app.Error)
	Refresh(context.Context, string) (dto.Session, *app.Error)
	Logout(context.Context, string, string) *app.Error
	ParseAccessToken(string) (*dto.Claims, *app.Error)
	ValidateSession(context.Context, *dto.Claims) error
	HasPermission(context.Context, *dto.Claims, string) (bool, error)
	HasAnyRole(context.Context, *dto.Claims, ...string) (bool, error)
	BootstrapPlatformAdmin(context.Context, string, string) error
	GetUser(context.Context, *dto.Claims, string) (dto.User, error)
	ListUsers(context.Context, *dto.Claims, app.ListQuery) ([]dto.User, int, error)
	CreateUser(context.Context, *dto.Claims, dto.CreateUserRequest) (dto.User, error)
	UpdateUser(context.Context, *dto.Claims, string, dto.UpdateUserRequest) (dto.User, error)
	DeleteUser(context.Context, *dto.Claims, string) *app.Error
	CreateMerchantAccount(context.Context, *dto.Claims, dto.CreateMerchantAccountRequest) (dto.MerchantProvisioning, error)
	CreateMerchantUser(context.Context, *dto.Claims, dto.CreateMerchantUserRequest) (dto.MerchantUserProvisioning, error)
	ListMerchants(context.Context, *dto.Claims, app.ListQuery) ([]dto.Merchant, int, error)
	GetMerchant(context.Context, *dto.Claims) (dto.Merchant, error)
	UpdateMerchant(context.Context, *dto.Claims, string, dto.UpdateMerchantRequest) (dto.Merchant, error)
	ListPermissions(context.Context, *dto.Claims) ([]dto.Permission, error)
	ListRoles(context.Context, *dto.Claims, string) ([]dto.Role, error)
	GetRole(context.Context, *dto.Claims, string, string) (dto.Role, error)
	CreateRole(context.Context, *dto.Claims, string, dto.CreateRoleRequest) (dto.Role, error)
	UpdateRole(context.Context, *dto.Claims, string, string, dto.UpdateRoleRequest) (dto.Role, error)
	DeleteRole(context.Context, *dto.Claims, string, string) error
}
