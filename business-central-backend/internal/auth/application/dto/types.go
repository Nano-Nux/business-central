package dto

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Session struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	TokenType    string    `json:"token_type"`
	ExpiresAt    time.Time `json:"expires_at"`
	User         User      `json:"user"`
}

type User struct {
	ID            string    `json:"id"`
	MembershipID  string    `json:"membership_id"`
	MerchantID    string    `json:"merchant_id"`
	Email         string    `json:"email"`
	DisplayName   string    `json:"display_name"`
	Phone         *string   `json:"phone,omitempty"`
	ShopID        *string   `json:"shop_id,omitempty"`
	IsActive      bool      `json:"is_active"`
	PlatformAdmin bool      `json:"platform_admin"`
	Roles         []Role    `json:"roles"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Role struct {
	ID              string   `json:"id"`
	Code            string   `json:"code"`
	Name            string   `json:"name"`
	IsSystem        bool     `json:"is_system"`
	PermissionCodes []string `json:"permission_codes"`
}

type Permission struct {
	Code        string  `json:"code"`
	Description *string `json:"description,omitempty"`
}

type CreateRoleRequest struct {
	Code            string   `json:"code"`
	Name            string   `json:"name"`
	PermissionCodes []string `json:"permission_codes"`
}

type UpdateRoleRequest struct {
	Code            *string   `json:"code,omitempty"`
	Name            *string   `json:"name,omitempty"`
	PermissionCodes *[]string `json:"permission_codes,omitempty"`
}

type Currency struct {
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	Symbol        *string `json:"symbol,omitempty"`
	DecimalPlaces int16   `json:"decimal_places"`
}

type BusinessType struct {
	ID          string    `json:"id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
type CreateBusinessTypeRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	IsActive    *bool  `json:"is_active,omitempty"`
}
type UpdateBusinessTypeRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}

type CreateCurrencyRequest struct {
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	Symbol        *string `json:"symbol,omitempty"`
	DecimalPlaces *int16  `json:"decimal_places"`
}

type UpdateCurrencyRequest struct {
	Name          *string `json:"name,omitempty"`
	Symbol        *string `json:"symbol,omitempty"`
	DecimalPlaces *int16  `json:"decimal_places,omitempty"`
}

type LoginRequest struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	MerchantID string `json:"merchant_id,omitempty"`
}

type CreateUserRequest struct {
	Email       string   `json:"email"`
	Password    string   `json:"password"`
	DisplayName string   `json:"display_name"`
	Phone       *string  `json:"phone,omitempty"`
	RoleIDs     []string `json:"role_ids,omitempty"`
	RoleCode    string   `json:"role_code,omitempty"`
	ShopID      *string  `json:"shop_id,omitempty"`
}

type UpdateUserRequest struct {
	Email       *string   `json:"email,omitempty"`
	Password    *string   `json:"password,omitempty"`
	DisplayName *string   `json:"display_name,omitempty"`
	Phone       *string   `json:"phone,omitempty"`
	IsActive    *bool     `json:"is_active,omitempty"`
	RoleIDs     *[]string `json:"role_ids,omitempty"`
	ShopID      *string   `json:"shop_id,omitempty"`
}

type Merchant struct {
	ID                  string    `json:"id"`
	Name                string    `json:"name"`
	Slug                string    `json:"slug"`
	LegalName           *string   `json:"legal_name,omitempty"`
	DefaultCurrencyCode string    `json:"default_currency_code"`
	CountryCode         *string   `json:"country_code,omitempty"`
	POSComplexityLevel  string    `json:"pos_complexity_level"`
	IsActive            bool      `json:"is_active"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type CreateMerchantAccountRequest struct {
	Name                string  `json:"name"`
	Slug                string  `json:"slug"`
	LegalName           *string `json:"legal_name,omitempty"`
	DefaultCurrencyCode string  `json:"default_currency_code"`
	CountryCode         *string `json:"country_code,omitempty"`
	POSComplexityLevel  string  `json:"pos_complexity_level,omitempty"`
}

type CreateMerchantUserRequest struct {
	MerchantName        string  `json:"merchant_name"`
	MerchantSlug        string  `json:"merchant_slug"`
	MerchantLegalName   *string `json:"merchant_legal_name,omitempty"`
	DefaultCurrencyCode string  `json:"default_currency_code"`
	MerchantCountryCode *string `json:"merchant_country_code,omitempty"`
	POSComplexityLevel  string  `json:"pos_complexity_level,omitempty"`
	Email               string  `json:"email"`
	Password            string  `json:"password"`
	DisplayName         string  `json:"display_name"`
	Phone               *string `json:"phone,omitempty"`
}

type UpdateMerchantRequest struct {
	Name               *string `json:"name,omitempty"`
	LegalName          *string `json:"legal_name,omitempty"`
	CountryCode        *string `json:"country_code,omitempty"`
	POSComplexityLevel *string `json:"pos_complexity_level,omitempty"`
	IsActive           *bool   `json:"is_active,omitempty"`
}

type MerchantProvisioning struct {
	Merchant Merchant `json:"merchant"`
	Roles    []Role   `json:"roles"`
}

type MerchantUserProvisioning struct {
	Merchant Merchant `json:"merchant"`
	User     User     `json:"user"`
	Role     Role     `json:"role"`
}

type Claims struct {
	IdentityID    string `json:"identity_id"`
	MerchantID    string `json:"merchant_id"`
	MembershipID  string `json:"membership_id"`
	PlatformAdmin bool   `json:"platform_admin"`
	jwt.RegisteredClaims
}
