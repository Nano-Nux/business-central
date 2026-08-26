package postgres

import dto "business-central-backend/internal/auth/application/dto"

// DTO mappings are kept at the outbound boundary so application contracts do
// not depend on database adapter types.
type Session = dto.Session
type User = dto.User
type Role = dto.Role
type Permission = dto.Permission
type CreateRoleRequest = dto.CreateRoleRequest
type UpdateRoleRequest = dto.UpdateRoleRequest
type LoginRequest = dto.LoginRequest
type CreateUserRequest = dto.CreateUserRequest
type UpdateUserRequest = dto.UpdateUserRequest
type Merchant = dto.Merchant
type CreateMerchantAccountRequest = dto.CreateMerchantAccountRequest
type CreateMerchantUserRequest = dto.CreateMerchantUserRequest
type UpdateMerchantRequest = dto.UpdateMerchantRequest
type Currency = dto.Currency
type CreateCurrencyRequest = dto.CreateCurrencyRequest
type UpdateCurrencyRequest = dto.UpdateCurrencyRequest
type BusinessType = dto.BusinessType
type CreateBusinessTypeRequest = dto.CreateBusinessTypeRequest
type UpdateBusinessTypeRequest = dto.UpdateBusinessTypeRequest
type MerchantProvisioning = dto.MerchantProvisioning
type MerchantUserProvisioning = dto.MerchantUserProvisioning
type Claims = dto.Claims
