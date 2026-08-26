// Package auth exposes the legacy authentication API while the canonical
// implementation lives in adapters/outbound/postgres for the auth context.
package auth

import (
	"time"

	postgres "business-central-backend/internal/auth/adapters/outbound/postgres"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service = postgres.Service
type Session = postgres.Session
type User = postgres.User
type Role = postgres.Role
type Permission = postgres.Permission
type CreateRoleRequest = postgres.CreateRoleRequest
type UpdateRoleRequest = postgres.UpdateRoleRequest
type LoginRequest = postgres.LoginRequest
type CreateUserRequest = postgres.CreateUserRequest
type UpdateUserRequest = postgres.UpdateUserRequest
type Merchant = postgres.Merchant
type CreateMerchantAccountRequest = postgres.CreateMerchantAccountRequest
type CreateMerchantUserRequest = postgres.CreateMerchantUserRequest
type UpdateMerchantRequest = postgres.UpdateMerchantRequest
type Currency = postgres.Currency
type CreateCurrencyRequest = postgres.CreateCurrencyRequest
type UpdateCurrencyRequest = postgres.UpdateCurrencyRequest
type MerchantProvisioning = postgres.MerchantProvisioning
type MerchantUserProvisioning = postgres.MerchantUserProvisioning
type Claims = postgres.Claims

func NewService(pool *pgxpool.Pool, secret []byte, accessTokenTTL, refreshTokenTTL time.Duration, bcryptCost int) *Service {
	return postgres.NewService(pool, secret, accessTokenTTL, refreshTokenTTL, bcryptCost)
}
