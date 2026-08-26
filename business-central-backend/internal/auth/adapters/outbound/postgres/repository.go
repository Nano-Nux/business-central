package postgres

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authoutbound "business-central-backend/internal/auth/ports/outbound"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	pool            *pgxpool.Pool
	secret          []byte
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
	bcryptCost      int
}

func (s *Service) ListCurrencies(ctx context.Context) ([]Currency, error) {
	rows, err := s.pool.Query(ctx, `SELECT code, name, symbol, decimal_places FROM currencies ORDER BY code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	currencies := make([]Currency, 0)
	for rows.Next() {
		var currency Currency
		if err := rows.Scan(&currency.Code, &currency.Name, &currency.Symbol, &currency.DecimalPlaces); err != nil {
			return nil, err
		}
		currencies = append(currencies, currency)
	}
	return currencies, rows.Err()
}

func (s *Service) ListBusinessTypes(ctx context.Context) ([]BusinessType, error) {
	rows, err := s.pool.Query(ctx, `SELECT id,code,name,description,is_active,created_at,updated_at FROM business_types ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]BusinessType, 0)
	for rows.Next() {
		var item BusinessType
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.Description, &item.IsActive, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) GetBusinessType(ctx context.Context, id string) (BusinessType, error) {
	var item BusinessType
	err := s.pool.QueryRow(ctx, `SELECT id,code,name,description,is_active,created_at,updated_at FROM business_types WHERE id=$1::uuid`, id).Scan(&item.ID, &item.Code, &item.Name, &item.Description, &item.IsActive, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
func (s *Service) CreateBusinessType(ctx context.Context, claims *Claims, request CreateBusinessTypeRequest) (BusinessType, error) {
	if claims == nil || !claims.PlatformAdmin {
		return BusinessType{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	var item BusinessType
	err := s.pool.QueryRow(ctx, `INSERT INTO business_types(code,name,description,is_active) VALUES($1,$2,$3,COALESCE($4,true)) RETURNING id,code,name,description,is_active,created_at,updated_at`, request.Code, request.Name, request.Description, request.IsActive).Scan(&item.ID, &item.Code, &item.Name, &item.Description, &item.IsActive, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
func (s *Service) UpdateBusinessType(ctx context.Context, claims *Claims, id string, request UpdateBusinessTypeRequest) (BusinessType, error) {
	if claims == nil || !claims.PlatformAdmin {
		return BusinessType{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	var item BusinessType
	err := s.pool.QueryRow(ctx, `UPDATE business_types SET name=COALESCE($2,name),description=COALESCE($3,description),is_active=COALESCE($4,is_active),updated_at=now() WHERE id=$1::uuid RETURNING id,code,name,description,is_active,created_at,updated_at`, id, request.Name, request.Description, request.IsActive).Scan(&item.ID, &item.Code, &item.Name, &item.Description, &item.IsActive, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
func (s *Service) DeleteBusinessType(ctx context.Context, claims *Claims, id string) error {
	if claims == nil || !claims.PlatformAdmin {
		return app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	result, err := s.pool.Exec(ctx, `DELETE FROM business_types WHERE id=$1::uuid`, id)
	if err == nil && result.RowsAffected() == 0 {
		return app.NewError("NOT_FOUND", "Business type not found.", 404)
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return app.NewError("CONFLICT", "Business type is still assigned to a shop and cannot be deleted.", 409)
		}
	}
	return err
}

func (s *Service) GetCurrency(ctx context.Context, code string) (Currency, error) {
	var currency Currency
	err := s.pool.QueryRow(ctx, `SELECT code, name, symbol, decimal_places FROM currencies WHERE code = $1`, strings.ToUpper(strings.TrimSpace(code))).
		Scan(&currency.Code, &currency.Name, &currency.Symbol, &currency.DecimalPlaces)
	return currency, err
}

func (s *Service) CreateCurrency(ctx context.Context, claims *Claims, request CreateCurrencyRequest) (Currency, error) {
	if claims == nil || !claims.PlatformAdmin {
		return Currency{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	var currency Currency
	err := s.pool.QueryRow(ctx, `
		INSERT INTO currencies(code, name, symbol, decimal_places)
		VALUES ($1, $2, $3, $4)
		RETURNING code, name, symbol, decimal_places`,
		request.Code, request.Name, request.Symbol, *request.DecimalPlaces).
		Scan(&currency.Code, &currency.Name, &currency.Symbol, &currency.DecimalPlaces)
	return currency, err
}

func (s *Service) UpdateCurrency(ctx context.Context, claims *Claims, code string, request UpdateCurrencyRequest) (Currency, error) {
	if claims == nil || !claims.PlatformAdmin {
		return Currency{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	sets := make([]string, 0, 3)
	args := []any{strings.ToUpper(strings.TrimSpace(code))}
	if request.Name != nil {
		args = append(args, *request.Name)
		sets = append(sets, fmt.Sprintf("name = $%d", len(args)))
	}
	if request.Symbol != nil {
		args = append(args, *request.Symbol)
		sets = append(sets, fmt.Sprintf("symbol = $%d", len(args)))
	}
	if request.DecimalPlaces != nil {
		args = append(args, *request.DecimalPlaces)
		sets = append(sets, fmt.Sprintf("decimal_places = $%d", len(args)))
	}
	query := `UPDATE currencies SET ` + strings.Join(sets, ", ") + ` WHERE code = $1 RETURNING code, name, symbol, decimal_places`
	var currency Currency
	err := s.pool.QueryRow(ctx, query, args...).Scan(&currency.Code, &currency.Name, &currency.Symbol, &currency.DecimalPlaces)
	return currency, err
}

func (s *Service) DeleteCurrency(ctx context.Context, claims *Claims, code string) error {
	if claims == nil || !claims.PlatformAdmin {
		return app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	result, err := s.pool.Exec(ctx, `DELETE FROM currencies WHERE code = $1`, strings.ToUpper(strings.TrimSpace(code)))
	if err == nil {
		if result.RowsAffected() == 0 {
			return app.NewError("NOT_FOUND", "Currency not found.", 404)
		}
		return nil
	}
	var postgresErr *pgconn.PgError
	if errors.As(err, &postgresErr) && postgresErr.Code == "23503" {
		return app.NewError("CONFLICT", "Currency is still referenced and cannot be deleted.", 409)
	}
	return err
}

func NewService(pool *pgxpool.Pool, secret []byte, accessTokenTTL, refreshTokenTTL time.Duration, bcryptCost int) *Service {
	return &Service{pool: pool, secret: secret, accessTokenTTL: accessTokenTTL, refreshTokenTTL: refreshTokenTTL, bcryptCost: bcryptCost}
}

func (s *Service) Login(ctx context.Context, request LoginRequest) (Session, *app.Error) {
	email := strings.ToLower(strings.TrimSpace(request.Email))
	if email == "" || request.Password == "" {
		return Session{}, app.NewError("VALIDATION_ERROR", "Email and password are required.", 400)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Session{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', 'login', true)`); err != nil {
		return Session{}, app.Internal(err)
	}
	var identityID, passwordHash string
	var active bool
	var failedAttempts int
	var lockedUntil *time.Time
	err = tx.QueryRow(ctx, `SELECT id, password_hash, is_active, failed_attempts, locked_until
        FROM user_identities WHERE lower(email) = $1`, email).
		Scan(&identityID, &passwordHash, &active, &failedAttempts, &lockedUntil)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, app.NewError("UNAUTHENTICATED", "Invalid email or password.", 401)
	}
	if err != nil {
		return Session{}, app.Internal(err)
	}
	if !active || (lockedUntil != nil && lockedUntil.After(time.Now().UTC())) {
		return Session{}, app.NewError("UNAUTHENTICATED", "Invalid email or password.", 401)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(request.Password)); err != nil {
		failedAttempts++
		var lock *time.Time
		if failedAttempts >= 5 {
			value := time.Now().UTC().Add(15 * time.Minute)
			lock = &value
		}
		_, updateErr := tx.Exec(ctx, `UPDATE user_identities SET failed_attempts = $2, locked_until = $3 WHERE id = $1`, identityID, failedAttempts, lock)
		if updateErr != nil {
			return Session{}, app.Internal(updateErr)
		}
		return Session{}, app.NewError("UNAUTHENTICATED", "Invalid email or password.", 401)
	}

	if _, err := tx.Exec(ctx, `SELECT set_config('app.user_id', $1, true)`, identityID); err != nil {
		return Session{}, app.Internal(err)
	}
	memberships, err := s.membershipsForIdentity(ctx, tx, identityID)
	if err != nil {
		return Session{}, app.Internal(err)
	}
	platformAdmin, err := s.platformAdminForIdentityTx(ctx, tx, identityID)
	if err != nil {
		return Session{}, app.Internal(err)
	}
	var merchantID, membershipID, displayName string
	var phone, shopID *string
	var membershipActive = true
	if platformAdmin {
		displayName = email
	} else {
		var membershipErr *app.Error
		merchantID, membershipID, displayName, phone, shopID, membershipActive, membershipErr = selectMembership(memberships, request.MerchantID)
		if membershipErr != nil {
			return Session{}, membershipErr
		}
		if !membershipActive {
			return Session{}, app.NewError("FORBIDDEN", "The user membership or merchant is inactive.", 403)
		}
	}
	if _, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', '', true), set_config('app.user_id', $1, true), set_config('app.merchant_id', $2, true)`, identityID, merchantID); err != nil {
		return Session{}, app.Internal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE user_identities SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, identityID); err != nil {
		return Session{}, app.Internal(err)
	}
	refreshToken, refreshHash, err := newRefreshToken()
	if err != nil {
		return Session{}, app.Internal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO refresh_tokens(identity_id, token_hash, expires_at) VALUES ($1, $2, $3)`, identityID, refreshHash, time.Now().UTC().Add(s.refreshTokenTTL)); err != nil {
		return Session{}, app.Internal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Session{}, app.Internal(err)
	}
	roles := []Role{}
	if membershipID != "" {
		var roleErr error
		roles, roleErr = s.rolesForMembership(ctx, identityID, merchantID, membershipID)
		if roleErr != nil {
			return Session{}, app.Internal(roleErr)
		}
	}
	user := User{ID: identityID, MembershipID: membershipID, MerchantID: merchantID, Email: email, DisplayName: displayName, Phone: phone, ShopID: shopID, IsActive: true, PlatformAdmin: platformAdmin, Roles: roles}
	access, expiresAt, err := s.issueAccessToken(identityID, merchantID, membershipID, platformAdmin)
	if err != nil {
		return Session{}, app.Internal(err)
	}
	return Session{AccessToken: access, RefreshToken: refreshToken, TokenType: "Bearer", ExpiresAt: expiresAt, User: user}, nil
}

func (s *Service) Refresh(ctx context.Context, rawToken string) (Session, *app.Error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return Session{}, app.NewError("UNAUTHENTICATED", "Refresh token is required.", 401)
	}
	hash := hashToken(rawToken)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Session{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', 'refresh', true)`); err != nil {
		return Session{}, app.Internal(err)
	}
	var identityID string
	var expiresAt time.Time
	err = tx.QueryRow(ctx, `SELECT identity_id, expires_at FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL`, hash).Scan(&identityID, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) || expiresAt.Before(time.Now().UTC()) {
		return Session{}, app.NewError("UNAUTHENTICATED", "Refresh token is invalid or expired.", 401)
	}
	if err != nil {
		return Session{}, app.Internal(err)
	}
	if _, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', '', true), set_config('app.user_id', $1, true)`, identityID); err != nil {
		return Session{}, app.Internal(err)
	}
	platformAdmin, err := s.platformAdminForIdentityTx(ctx, tx, identityID)
	if err != nil {
		return Session{}, app.Internal(err)
	}
	var merchantID, membershipID, displayName, email string
	var phone, shopID *string
	active := true
	if platformAdmin {
		err = tx.QueryRow(ctx, `SELECT email FROM user_identities WHERE id = $1 AND is_active`, identityID).Scan(&email)
		displayName = email
	} else {
		err = tx.QueryRow(ctx, `SELECT um.merchant_id, um.id, um.display_name, um.phone, um.shop_id, um.is_active, i.email
		FROM user_memberships um JOIN user_identities i ON i.id = um.identity_id JOIN merchants m ON m.id = um.merchant_id
		WHERE um.identity_id = $1 AND um.is_active AND i.is_active AND m.is_active
		ORDER BY um.created_at LIMIT 1`, identityID).Scan(&merchantID, &membershipID, &displayName, &phone, &shopID, &active, &email)
	}
	if errors.Is(err, pgx.ErrNoRows) || !active {
		return Session{}, app.NewError("FORBIDDEN", "The user is inactive or has no active membership.", 403)
	}
	if _, err := tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, hash); err != nil {
		return Session{}, app.Internal(err)
	}
	newToken, newHash, err := newRefreshToken()
	if err != nil {
		return Session{}, app.Internal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO refresh_tokens(identity_id, token_hash, expires_at) VALUES ($1, $2, $3)`, identityID, newHash, time.Now().UTC().Add(s.refreshTokenTTL)); err != nil {
		return Session{}, app.Internal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Session{}, app.Internal(err)
	}
	roles := []Role{}
	if membershipID != "" {
		roles, err = s.rolesForMembership(ctx, identityID, merchantID, membershipID)
		if err != nil {
			return Session{}, app.Internal(err)
		}
	}
	access, accessExpiresAt, err := s.issueAccessToken(identityID, merchantID, membershipID, platformAdmin)
	if err != nil {
		return Session{}, app.Internal(err)
	}
	return Session{AccessToken: access, RefreshToken: newToken, TokenType: "Bearer", ExpiresAt: accessExpiresAt, User: User{ID: identityID, MembershipID: membershipID, MerchantID: merchantID, Email: email, DisplayName: displayName, Phone: phone, ShopID: shopID, IsActive: true, PlatformAdmin: platformAdmin, Roles: roles}}, nil
}

func (s *Service) Logout(ctx context.Context, identityID, rawToken string) *app.Error {
	if strings.TrimSpace(rawToken) == "" {
		return nil
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', '', true), set_config('app.user_id', $1, true)`, identityID); err != nil {
		return app.Internal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE identity_id = $1 AND token_hash = $2 AND revoked_at IS NULL`, identityID, hashToken(rawToken)); err != nil {
		return app.Internal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return app.Internal(err)
	}
	return nil
}

func (s *Service) ParseAccessToken(raw string) (*Claims, *app.Error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil || !token.Valid {
		return nil, app.NewError("UNAUTHENTICATED", "Authentication is required.", 401)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || uuid.Validate(claims.IdentityID) != nil || (!claims.PlatformAdmin && (uuid.Validate(claims.MerchantID) != nil || uuid.Validate(claims.MembershipID) != nil)) || (claims.PlatformAdmin && (claims.MerchantID != "" || claims.MembershipID != "")) {
		return nil, app.NewError("UNAUTHENTICATED", "Authentication is required.", 401)
	}
	return claims, nil
}

func (s *Service) HasPermission(ctx context.Context, claims *Claims, permission string) (bool, error) {
	if claims.PlatformAdmin {
		return true, nil
	}
	var allowed bool
	err := s.pool.QueryRow(ctx, `SELECT set_config('app.user_id', $1, true), set_config('app.merchant_id', $2, true), app_has_permission($3)`, claims.IdentityID, claims.MerchantID, permission).Scan(new(string), new(string), &allowed)
	return allowed, err
}

func (s *Service) HasAnyRole(ctx context.Context, claims *Claims, roleCodes ...string) (bool, error) {
	if claims == nil || claims.PlatformAdmin || claims.MerchantID == "" || claims.MembershipID == "" {
		return false, nil
	}
	for index := range roleCodes {
		roleCodes[index] = strings.ToLower(strings.TrimSpace(roleCodes[index]))
	}
	var allowed bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM membership_roles mr
			JOIN roles r ON r.merchant_id=mr.merchant_id AND r.id=mr.role_id
			WHERE mr.merchant_id=$1::uuid AND mr.membership_id=$2::uuid
			  AND lower(r.code)=ANY($3::text[])
		)`, claims.MerchantID, claims.MembershipID, roleCodes).Scan(&allowed)
	return allowed, err
}

func (s *Service) platformAdminForIdentityTx(ctx context.Context, tx pgx.Tx, identityID string) (bool, error) {
	var isAdmin bool
	err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM platform_admin_identities WHERE identity_id = $1)`, identityID).Scan(&isAdmin)
	return isAdmin, err
}

func (s *Service) BootstrapPlatformAdmin(ctx context.Context, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || len(password) < 8 {
		return errors.New("platform admin email and password are required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.bcryptCost)
	if err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', 'login', true)`); err != nil {
		return err
	}
	var identityID string
	var active bool
	err = tx.QueryRow(ctx, `SELECT id, is_active FROM user_identities WHERE lower(email) = $1`, email).Scan(&identityID, &active)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `INSERT INTO user_identities(email, password_hash) VALUES ($1, $2) RETURNING id`, email, string(hash)).Scan(&identityID)
		if err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else if !active {
		return errors.New("platform admin identity is inactive")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO platform_admin_identities(identity_id) VALUES ($1) ON CONFLICT (identity_id) DO NOTHING`, identityID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// BootstrapDefaultAdmin creates the first platform administrator only when
// the database has no user identities. It is intentionally idempotent for
// application startup: once any user exists, startup never creates another
// default administrator.
func (s *Service) BootstrapDefaultAdmin(ctx context.Context, email, password string) (bool, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || len(password) < 8 {
		return false, errors.New("default admin email and password are required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.bcryptCost)
	if err != nil {
		return false, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', 'login', true)`); err != nil {
		return false, err
	}
	var hasUsers bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM user_identities LIMIT 1)`).Scan(&hasUsers); err != nil {
		return false, err
	}
	if hasUsers {
		if err := tx.Commit(ctx); err != nil {
			return false, err
		}
		return false, nil
	}
	var identityID string
	if err := tx.QueryRow(ctx, `INSERT INTO user_identities(email, password_hash) VALUES ($1, $2) RETURNING id`, email, string(hash)).Scan(&identityID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO platform_admin_identities(identity_id) VALUES ($1)`, identityID); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Service) ValidateSession(ctx context.Context, claims *Claims) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return err
	}
	var active bool
	query := `SELECT EXISTS (
        SELECT 1
          FROM user_identities i
          JOIN user_memberships um ON um.identity_id = i.id
		WHERE i.id = $1 AND i.is_active AND um.id = $2 AND um.merchant_id = $3 AND um.is_active
		   AND EXISTS (SELECT 1 FROM merchants m WHERE m.id = um.merchant_id AND m.is_active)
	)`
	args := []any{claims.IdentityID, claims.MembershipID, claims.MerchantID}
	if claims.PlatformAdmin {
		query = `SELECT EXISTS (SELECT 1 FROM user_identities i JOIN platform_admin_identities pai ON pai.identity_id = i.id WHERE i.id = $1 AND i.is_active)`
		args = []any{claims.IdentityID}
	}
	if err := tx.QueryRow(ctx, query, args...).Scan(&active); err != nil {
		return err
	}
	if !active {
		return app.NewError("UNAUTHENTICATED", "Authentication is required.", 401)
	}
	return tx.Commit(ctx)
}

func (s *Service) GetUser(ctx context.Context, claims *Claims, membershipID string) (User, error) {
	if claims.PlatformAdmin && membershipID == "" {
		return s.getPlatformAdminUser(ctx, claims.IdentityID)
	}
	return s.getUser(ctx, claims.IdentityID, claims.MerchantID, membershipID)
}

func (s *Service) ListMerchants(ctx context.Context, claims *Claims, query app.ListQuery) ([]Merchant, int, error) {
	if !claims.PlatformAdmin {
		return nil, 0, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return nil, 0, err
	}
	where := "1=1"
	args := []any{}
	if query.Search != "" {
		args = append(args, "%"+query.Search+"%")
		where += fmt.Sprintf(" AND (m.name ILIKE $%d OR m.slug ILIKE $%d OR m.legal_name ILIKE $%d)", len(args), len(args), len(args))
	}
	if active := query.Filter("is_active"); active != "" {
		args = append(args, active == "true")
		where += fmt.Sprintf(" AND m.is_active=$%d", len(args))
	}
	dataArgs := append([]any{}, args...)
	dataArgs = append(dataArgs, query.PageSize, query.PageIndex*query.PageSize)
	rows, err := tx.Query(ctx, "SELECT m.id,m.name,m.slug,m.legal_name,m.default_currency_code,m.country_code,m.pos_complexity_level,m.is_active,m.created_at,m.updated_at FROM merchants m WHERE "+where+" ORDER BY m.created_at DESC LIMIT $"+fmt.Sprint(len(args)+1)+" OFFSET $"+fmt.Sprint(len(args)+2), dataArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	merchants := []Merchant{}
	for rows.Next() {
		var m Merchant
		if err := rows.Scan(&m.ID, &m.Name, &m.Slug, &m.LegalName, &m.DefaultCurrencyCode, &m.CountryCode, &m.POSComplexityLevel, &m.IsActive, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, 0, err
		}
		merchants = append(merchants, m)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM merchants m WHERE "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return merchants, total, nil
}

func (s *Service) GetMerchant(ctx context.Context, claims *Claims) (Merchant, error) {
	var merchant Merchant
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true)) SELECT m.id,m.name,m.slug,m.legal_name,m.default_currency_code,m.country_code,m.pos_complexity_level,m.is_active,m.created_at,m.updated_at FROM merchants m CROSS JOIN x WHERE m.id=$1::uuid`, claims.MerchantID, claims.IdentityID).Scan(&merchant.ID, &merchant.Name, &merchant.Slug, &merchant.LegalName, &merchant.DefaultCurrencyCode, &merchant.CountryCode, &merchant.POSComplexityLevel, &merchant.IsActive, &merchant.CreatedAt, &merchant.UpdatedAt)
	return merchant, err
}

func (s *Service) UpdateMerchant(ctx context.Context, claims *Claims, merchantID string, request UpdateMerchantRequest) (Merchant, error) {
	if request.POSComplexityLevel != nil && *request.POSComplexityLevel != "SIMPLE" && *request.POSComplexityLevel != "COMPLEX" {
		return Merchant{}, app.NewError("VALIDATION_ERROR", "pos_complexity_level must be SIMPLE or COMPLEX.", 400)
	}
	if !claims.PlatformAdmin && claims.MerchantID != merchantID {
		return Merchant{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Merchant{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return Merchant{}, err
	}
	idempotencyKey := strings.TrimSpace(app.IdempotencyKey(ctx))
	var idempotencyHash string
	if idempotencyKey != "" {
		requestBody, marshalErr := json.Marshal(request)
		if marshalErr != nil {
			return Merchant{}, marshalErr
		}
		idempotencyHash = fmt.Sprintf("%x", sha256.Sum256(requestBody))
		var inserted bool
		if err = tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,'auth.merchant',$2,'PROCESSING',jsonb_build_object('request_hash',$3::text),now()+interval '24 hours') ON CONFLICT(merchant_id,scope,idempotency_key) DO NOTHING RETURNING true`, merchantID, idempotencyKey, idempotencyHash).Scan(&inserted); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return Merchant{}, err
		}
		if !inserted {
			var status string
			var sameRequest bool
			var stored json.RawMessage
			if err = tx.QueryRow(ctx, `SELECT status,response_body->>'request_hash'=$3,response_body->'response' FROM idempotency_keys WHERE merchant_id=$1::uuid AND scope='auth.merchant' AND idempotency_key=$2 FOR UPDATE`, merchantID, idempotencyKey, idempotencyHash).Scan(&status, &sameRequest, &stored); err != nil {
				return Merchant{}, err
			}
			if !sameRequest {
				return Merchant{}, app.NewError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for different merchant settings.", 409)
			}
			if status == "COMPLETED" && len(stored) > 0 {
				var existing Merchant
				if err = json.Unmarshal(stored, &existing); err != nil {
					return Merchant{}, err
				}
				return existing, nil
			}
			return Merchant{}, app.NewError("REQUEST_IN_PROGRESS", "This merchant update is already being processed.", 409)
		}
	}
	var merchant Merchant
	err = tx.QueryRow(ctx, `UPDATE merchants SET name = COALESCE($2, name), legal_name = COALESCE($3, legal_name), country_code = COALESCE($4, country_code), pos_complexity_level = COALESCE($5, pos_complexity_level), is_active = COALESCE($6, is_active) WHERE id = $1 RETURNING id, name, slug, legal_name, default_currency_code, country_code, pos_complexity_level, is_active, created_at, updated_at`, merchantID, request.Name, request.LegalName, request.CountryCode, request.POSComplexityLevel, request.IsActive).Scan(&merchant.ID, &merchant.Name, &merchant.Slug, &merchant.LegalName, &merchant.DefaultCurrencyCode, &merchant.CountryCode, &merchant.POSComplexityLevel, &merchant.IsActive, &merchant.CreatedAt, &merchant.UpdatedAt)
	if err != nil {
		return Merchant{}, err
	}
	var actor any
	if claims.MembershipID != "" {
		actor = claims.MembershipID
	}
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events(merchant_id, actor_membership_id, action, entity_type, entity_id, after_data) VALUES ($1, $2, 'UPDATE', 'merchant', $1, jsonb_build_object('is_active', $3::boolean, 'name', $4::text))`, merchantID, actor, merchant.IsActive, merchant.Name); err != nil {
		return Merchant{}, err
	}
	if idempotencyKey != "" {
		responseBody, marshalErr := json.Marshal(merchant)
		if marshalErr != nil {
			return Merchant{}, marshalErr
		}
		if _, err := tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=200,response_body=jsonb_build_object('request_hash',$3::text,'response',$4::jsonb) WHERE merchant_id=$1::uuid AND scope='auth.merchant' AND idempotency_key=$2`, merchantID, idempotencyKey, idempotencyHash, responseBody); err != nil {
			return Merchant{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Merchant{}, err
	}
	return merchant, nil
}

func (s *Service) ListPermissions(ctx context.Context, claims *Claims) ([]Permission, error) {
	if claims == nil || !claims.PlatformAdmin {
		return nil, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	rows, err := s.pool.Query(ctx, `SELECT code, description FROM permissions ORDER BY code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	permissions := make([]Permission, 0)
	for rows.Next() {
		var permission Permission
		if err := rows.Scan(&permission.Code, &permission.Description); err != nil {
			return nil, err
		}
		permissions = append(permissions, permission)
	}
	return permissions, rows.Err()
}

func (s *Service) ListRoles(ctx context.Context, claims *Claims, merchantID string) ([]Role, error) {
	if claims == nil || (!claims.PlatformAdmin && claims.MerchantID != merchantID) {
		return nil, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `
		SELECT r.id, r.code, r.name, r.is_system,
		       COALESCE(array_agg(rp.permission_code ORDER BY rp.permission_code)
		           FILTER (WHERE rp.permission_code IS NOT NULL), ARRAY[]::varchar[])
		  FROM roles r
		  LEFT JOIN role_permissions rp ON rp.role_id = r.id
		 WHERE r.merchant_id = $1
		 GROUP BY r.id, r.code, r.name, r.is_system
		 ORDER BY r.code`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := make([]Role, 0)
	for rows.Next() {
		var role Role
		if err := rows.Scan(&role.ID, &role.Code, &role.Name, &role.IsSystem, &role.PermissionCodes); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return roles, nil
}

func (s *Service) GetRole(ctx context.Context, claims *Claims, merchantID, roleID string) (Role, error) {
	if claims == nil || !claims.PlatformAdmin {
		return Role{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Role{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return Role{}, err
	}
	role, err := getRoleTx(ctx, tx, merchantID, roleID)
	if err != nil {
		return Role{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Role{}, err
	}
	return role, nil
}

func (s *Service) CreateRole(ctx context.Context, claims *Claims, merchantID string, request CreateRoleRequest) (Role, error) {
	if claims == nil || !claims.PlatformAdmin {
		return Role{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Role{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return Role{}, err
	}
	var roleID string
	if err := tx.QueryRow(ctx, `INSERT INTO roles(merchant_id, code, name, is_system) VALUES ($1, $2, $3, false) RETURNING id`, merchantID, request.Code, request.Name).Scan(&roleID); err != nil {
		return Role{}, err
	}
	if err := replaceRolePermissions(ctx, tx, roleID, request.PermissionCodes); err != nil {
		return Role{}, err
	}
	if err := auditRole(ctx, tx, merchantID, claims, "CREATE", roleID, map[string]any{"code": request.Code, "name": request.Name, "permission_codes": request.PermissionCodes}); err != nil {
		return Role{}, err
	}
	role, err := getRoleTx(ctx, tx, merchantID, roleID)
	if err != nil {
		return Role{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Role{}, err
	}
	return role, nil
}

func (s *Service) UpdateRole(ctx context.Context, claims *Claims, merchantID, roleID string, request UpdateRoleRequest) (Role, error) {
	if claims == nil || !claims.PlatformAdmin {
		return Role{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Role{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return Role{}, err
	}
	before, err := getRoleTx(ctx, tx, merchantID, roleID)
	if err != nil {
		return Role{}, err
	}
	if before.IsSystem && request.Code != nil && *request.Code != before.Code {
		return Role{}, app.NewError("CONFLICT", "A system role code cannot be changed.", 409)
	}
	if _, err := tx.Exec(ctx, `UPDATE roles SET code = COALESCE($3, code), name = COALESCE($4, name) WHERE merchant_id = $1 AND id = $2`, merchantID, roleID, request.Code, request.Name); err != nil {
		return Role{}, err
	}
	if request.PermissionCodes != nil {
		if err := replaceRolePermissions(ctx, tx, roleID, *request.PermissionCodes); err != nil {
			return Role{}, err
		}
	}
	role, err := getRoleTx(ctx, tx, merchantID, roleID)
	if err != nil {
		return Role{}, err
	}
	if err := auditRole(ctx, tx, merchantID, claims, "UPDATE", roleID, map[string]any{"code": role.Code, "name": role.Name, "permission_codes": role.PermissionCodes}); err != nil {
		return Role{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Role{}, err
	}
	return role, nil
}

func (s *Service) DeleteRole(ctx context.Context, claims *Claims, merchantID, roleID string) error {
	if claims == nil || !claims.PlatformAdmin {
		return app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return err
	}
	role, err := getRoleTx(ctx, tx, merchantID, roleID)
	if err != nil {
		return err
	}
	if role.IsSystem {
		return app.NewError("CONFLICT", "System roles cannot be deleted.", 409)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM roles WHERE merchant_id = $1 AND id = $2`, merchantID, roleID); err != nil {
		return err
	}
	if err := auditRole(ctx, tx, merchantID, claims, "DELETE", roleID, map[string]any{"code": role.Code, "name": role.Name}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func getRoleTx(ctx context.Context, tx pgx.Tx, merchantID, roleID string) (Role, error) {
	var role Role
	err := tx.QueryRow(ctx, `
		SELECT r.id, r.code, r.name, r.is_system,
		       ARRAY(SELECT rp.permission_code FROM role_permissions rp WHERE rp.role_id = r.id ORDER BY rp.permission_code)
		  FROM roles r
		 WHERE r.merchant_id = $1 AND r.id = $2`, merchantID, roleID).
		Scan(&role.ID, &role.Code, &role.Name, &role.IsSystem, &role.PermissionCodes)
	return role, err
}

func replaceRolePermissions(ctx context.Context, tx pgx.Tx, roleID string, permissionCodes []string) error {
	if len(permissionCodes) > 0 {
		var count int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM permissions WHERE code = ANY($1::text[])`, permissionCodes).Scan(&count); err != nil {
			return err
		}
		if count != len(permissionCodes) {
			return app.Validation("One or more permission codes are invalid.", map[string]any{"permission_codes": "contains unknown permission"})
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return err
	}
	if len(permissionCodes) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `INSERT INTO role_permissions(role_id, permission_code) SELECT $1, unnest($2::text[])`, roleID, permissionCodes)
	return err
}

func auditRole(ctx context.Context, tx pgx.Tx, merchantID string, claims *Claims, action, roleID string, after map[string]any) error {
	var actorMembership any
	if claims.MembershipID != "" {
		actorMembership = claims.MembershipID
	}
	_, err := tx.Exec(ctx, `INSERT INTO audit_events(merchant_id, actor_membership_id, action, entity_type, entity_id, after_data) VALUES ($1, $2, $3, 'role', $4, $5)`, merchantID, actorMembership, action, roleID, after)
	return err
}

func (s *Service) ListUsers(ctx context.Context, claims *Claims, query app.ListQuery) ([]User, int, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return nil, 0, err
	}
	where := "um.merchant_id=$1::uuid"
	args := []any{claims.MerchantID}
	if query.Search != "" {
		args = append(args, "%"+query.Search+"%")
		where += " AND (i.email ILIKE $2 OR um.display_name ILIKE $2 OR um.phone ILIKE $2)"
	}
	if active := query.Filter("is_active"); active != "" {
		args = append(args, active == "true")
		where += fmt.Sprintf(" AND um.is_active=$%d", len(args))
	}
	if role := query.Filter("role"); role != "" {
		args = append(args, role)
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM membership_roles mr JOIN roles r ON r.merchant_id=mr.merchant_id AND r.id=mr.role_id WHERE mr.merchant_id=um.merchant_id AND mr.membership_id=um.id AND r.code=$%d)", len(args))
	}
	dataArgs := append([]any{}, args...)
	dataArgs = append(dataArgs, query.PageSize, query.PageIndex*query.PageSize)
	rows, err := tx.Query(ctx, "SELECT um.id,um.identity_id,um.merchant_id,i.email,um.display_name,um.phone,um.shop_id,um.is_active,um.created_at,um.updated_at FROM user_memberships um JOIN user_identities i ON i.id=um.identity_id WHERE "+where+" ORDER BY um.created_at DESC LIMIT $"+fmt.Sprint(len(args)+1)+" OFFSET $"+fmt.Sprint(len(args)+2), dataArgs...)
	if err != nil {
		return nil, 0, err
	}
	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.MembershipID, &u.ID, &u.MerchantID, &u.Email, &u.DisplayName, &u.Phone, &u.ShopID, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
			rows.Close()
			return nil, 0, err
		}
		users = append(users, u)
	}
	rowsErr := rows.Err()
	rows.Close()
	if rowsErr != nil {
		return nil, 0, rowsErr
	}
	for i := range users {
		users[i].Roles, err = s.rolesForMembershipTx(ctx, tx, claims.MerchantID, users[i].MembershipID)
		if err != nil {
			return nil, 0, err
		}
	}
	var total int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM user_memberships um JOIN user_identities i ON i.id=um.identity_id WHERE "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return users, total, nil
}

func (s *Service) CreateUser(ctx context.Context, claims *Claims, request CreateUserRequest) (User, error) {
	email := strings.ToLower(strings.TrimSpace(request.Email))
	if email == "" || request.Password == "" || strings.TrimSpace(request.DisplayName) == "" {
		return User{}, app.NewError("VALIDATION_ERROR", "Email, password, and display_name are required.", 400)
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(request.Password), s.bcryptCost)
	if err != nil {
		return User{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return User{}, err
	}
	var identityID, membershipID string
	err = tx.QueryRow(ctx, `INSERT INTO user_identities(email, password_hash) VALUES ($1, $2) RETURNING id`, email, string(passwordHash)).Scan(&identityID)
	if err != nil {
		return User{}, err
	}
	if request.ShopID != nil {
		var found bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM shops WHERE merchant_id=$1::uuid AND id=$2 AND is_active)`, claims.MerchantID, *request.ShopID).Scan(&found); err != nil {
			return User{}, err
		}
		if !found {
			return User{}, app.Validation("shop_id must reference an active shop in this merchant.", map[string]any{"shop_id": "invalid"})
		}
	}
	roleIDs := request.RoleIDs
	if len(roleIDs) == 0 && strings.TrimSpace(request.RoleCode) != "" {
		var roleID string
		if err = tx.QueryRow(ctx, `SELECT id FROM roles WHERE merchant_id=$1::uuid AND lower(code)=lower($2)`, claims.MerchantID, request.RoleCode).Scan(&roleID); err != nil {
			return User{}, app.Validation("role_code is not available for this merchant.", map[string]any{"role_code": "invalid"})
		}
		roleIDs = []string{roleID}
	}
	var assignsStaff bool
	if len(roleIDs) > 0 {
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM roles WHERE merchant_id=$1::uuid AND id=ANY($2::uuid[]) AND lower(code)='staff')`, claims.MerchantID, roleIDs).Scan(&assignsStaff); err != nil {
			return User{}, err
		}
	}
	if assignsStaff && request.ShopID == nil {
		return User{}, app.Validation("Staff must be assigned to one shop.", map[string]any{"shop_id": "required"})
	}
	err = tx.QueryRow(ctx, `INSERT INTO user_memberships(merchant_id, identity_id, display_name, phone, shop_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`, claims.MerchantID, identityID, strings.TrimSpace(request.DisplayName), request.Phone, request.ShopID).Scan(&membershipID)
	if err != nil {
		return User{}, err
	}
	if err := assignRoles(ctx, tx, claims.MerchantID, membershipID, roleIDs, claims.MembershipID); err != nil {
		return User{}, err
	}
	if err := audit(ctx, tx, claims, "CREATE", membershipID, nil, map[string]any{"email": email, "display_name": request.DisplayName}); err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return s.getUser(ctx, identityID, claims.MerchantID, membershipID)
}

func (s *Service) CreateMerchantAccount(ctx context.Context, claims *Claims, request CreateMerchantAccountRequest) (MerchantProvisioning, error) {
	if !claims.PlatformAdmin {
		return MerchantProvisioning{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	name := strings.TrimSpace(request.Name)
	slug := strings.ToLower(strings.TrimSpace(request.Slug))
	currency := strings.ToUpper(strings.TrimSpace(request.DefaultCurrencyCode))
	if name == "" || slug == "" || len(currency) != 3 {
		return MerchantProvisioning{}, app.NewError("VALIDATION_ERROR", "name, slug, and default_currency_code are required.", 400)
	}
	request.POSComplexityLevel = strings.ToUpper(strings.TrimSpace(request.POSComplexityLevel))
	if request.POSComplexityLevel == "" {
		request.POSComplexityLevel = "SIMPLE"
	}
	if request.POSComplexityLevel != "SIMPLE" && request.POSComplexityLevel != "COMPLEX" {
		return MerchantProvisioning{}, app.NewError("VALIDATION_ERROR", "pos_complexity_level must be SIMPLE or COMPLEX.", 400)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantProvisioning{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return MerchantProvisioning{}, err
	}
	var currencyExists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM currencies WHERE code = $1)`, currency).Scan(&currencyExists); err != nil {
		return MerchantProvisioning{}, err
	}
	if !currencyExists {
		return MerchantProvisioning{}, app.NewError("VALIDATION_ERROR", "default_currency_code must reference a supported currency.", 400)
	}
	var merchant Merchant
	err = tx.QueryRow(ctx, `INSERT INTO merchants(name, slug, legal_name, default_currency_code, country_code, pos_complexity_level)
        VALUES ($1::varchar, $2::varchar, $3::varchar, $4::char(3), $5::char(2), COALESCE(NULLIF(upper($6),''),'SIMPLE'))
        RETURNING id, name, slug, legal_name, default_currency_code, country_code, pos_complexity_level, is_active, created_at, updated_at`, name, slug, request.LegalName, currency, request.CountryCode, request.POSComplexityLevel).
		Scan(&merchant.ID, &merchant.Name, &merchant.Slug, &merchant.LegalName, &merchant.DefaultCurrencyCode, &merchant.CountryCode, &merchant.POSComplexityLevel, &merchant.IsActive, &merchant.CreatedAt, &merchant.UpdatedAt)
	if err != nil {
		return MerchantProvisioning{}, err
	}
	roleSpecs := []struct {
		code        string
		name        string
		permissions []string
	}{
		{code: "manager", name: "Manager", permissions: []string{"tenant.read", "tenant.write", "membership.manage"}},
		{code: "staff", name: "Staff", permissions: []string{"tenant.read", "tenant.write"}},
	}
	roles := make([]Role, 0, len(roleSpecs))
	for _, spec := range roleSpecs {
		var role Role
		if err := tx.QueryRow(ctx, `INSERT INTO roles(merchant_id, code, name, is_system) VALUES ($1, $2, $3, true) RETURNING id, code, name`, merchant.ID, spec.code, spec.name).Scan(&role.ID, &role.Code, &role.Name); err != nil {
			return MerchantProvisioning{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO role_permissions(role_id, permission_code) SELECT $1, code FROM permissions WHERE code = ANY($2::text[]) ON CONFLICT DO NOTHING`, role.ID, spec.permissions); err != nil {
			return MerchantProvisioning{}, err
		}
		role.IsSystem = true
		role.PermissionCodes = spec.permissions
		roles = append(roles, role)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events(merchant_id, actor_membership_id, action, entity_type, entity_id, after_data) VALUES ($1, NULL, 'CREATE', 'merchant', $2, jsonb_build_object('name', $3::text, 'slug', $4::text, 'roles', jsonb_build_array('manager', 'staff')))`, merchant.ID, merchant.ID, name, slug); err != nil {
		return MerchantProvisioning{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MerchantProvisioning{}, err
	}
	return MerchantProvisioning{Merchant: merchant, Roles: roles}, nil
}

func (s *Service) CreateMerchantUser(ctx context.Context, claims *Claims, request CreateMerchantUserRequest) (MerchantUserProvisioning, error) {
	if claims == nil || !claims.PlatformAdmin {
		return MerchantUserProvisioning{}, app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	request.POSComplexityLevel = strings.ToUpper(strings.TrimSpace(request.POSComplexityLevel))
	if request.POSComplexityLevel == "" {
		request.POSComplexityLevel = "SIMPLE"
	}
	if request.POSComplexityLevel != "SIMPLE" && request.POSComplexityLevel != "COMPLEX" {
		return MerchantUserProvisioning{}, app.NewError("VALIDATION_ERROR", "pos_complexity_level must be SIMPLE or COMPLEX.", 400)
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(request.Password), s.bcryptCost)
	if err != nil {
		return MerchantUserProvisioning{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MerchantUserProvisioning{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return MerchantUserProvisioning{}, err
	}
	var merchant Merchant
	err = tx.QueryRow(ctx, `INSERT INTO merchants(name, slug, legal_name, default_currency_code, country_code, pos_complexity_level)
        VALUES ($1::varchar, $2::varchar, $3::varchar, $4::char(3), $5::char(2), COALESCE(NULLIF(upper($6),''),'SIMPLE'))
        RETURNING id, name, slug, legal_name, default_currency_code, country_code, pos_complexity_level, is_active, created_at, updated_at`, request.MerchantName, request.MerchantSlug, request.MerchantLegalName, request.DefaultCurrencyCode, request.MerchantCountryCode, request.POSComplexityLevel).
		Scan(&merchant.ID, &merchant.Name, &merchant.Slug, &merchant.LegalName, &merchant.DefaultCurrencyCode, &merchant.CountryCode, &merchant.POSComplexityLevel, &merchant.IsActive, &merchant.CreatedAt, &merchant.UpdatedAt)
	if err != nil {
		return MerchantUserProvisioning{}, err
	}
	var ownerRole Role
	if err := tx.QueryRow(ctx, `INSERT INTO roles(merchant_id, code, name, is_system) VALUES ($1, 'merchant', 'Merchant', true) RETURNING id, code, name, is_system`, merchant.ID).
		Scan(&ownerRole.ID, &ownerRole.Code, &ownerRole.Name, &ownerRole.IsSystem); err != nil {
		return MerchantUserProvisioning{}, err
	}
	ownerRole.PermissionCodes = []string{"tenant.read", "tenant.write", "rbac.manage", "membership.manage"}
	if _, err := tx.Exec(ctx, `INSERT INTO role_permissions(role_id, permission_code) SELECT $1, code FROM permissions WHERE code = ANY($2::text[]) ON CONFLICT DO NOTHING`, ownerRole.ID, ownerRole.PermissionCodes); err != nil {
		return MerchantUserProvisioning{}, err
	}
	roleSpecs := []struct {
		code        string
		name        string
		permissions []string
	}{
		{code: "manager", name: "Manager", permissions: []string{"tenant.read", "tenant.write", "membership.manage"}},
		{code: "staff", name: "Staff", permissions: []string{"tenant.read", "tenant.write"}},
	}
	for _, spec := range roleSpecs {
		var roleID string
		if err := tx.QueryRow(ctx, `INSERT INTO roles(merchant_id, code, name, is_system) VALUES ($1, $2, $3, true) RETURNING id`, merchant.ID, spec.code, spec.name).Scan(&roleID); err != nil {
			return MerchantUserProvisioning{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO role_permissions(role_id, permission_code) SELECT $1, code FROM permissions WHERE code = ANY($2::text[]) ON CONFLICT DO NOTHING`, roleID, spec.permissions); err != nil {
			return MerchantUserProvisioning{}, err
		}
	}
	var identityID, membershipID string
	if err := tx.QueryRow(ctx, `INSERT INTO user_identities(email, password_hash) VALUES ($1, $2) RETURNING id`, request.Email, string(passwordHash)).Scan(&identityID); err != nil {
		return MerchantUserProvisioning{}, err
	}
	if err := tx.QueryRow(ctx, `INSERT INTO user_memberships(merchant_id, identity_id, display_name, phone) VALUES ($1, $2, $3, $4) RETURNING id`, merchant.ID, identityID, request.DisplayName, request.Phone).Scan(&membershipID); err != nil {
		return MerchantUserProvisioning{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO membership_roles(merchant_id, membership_id, role_id) VALUES ($1, $2, $3)`, merchant.ID, membershipID, ownerRole.ID); err != nil {
		return MerchantUserProvisioning{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO audit_events(merchant_id, actor_membership_id, action, entity_type, entity_id, after_data) VALUES ($1, NULL, 'CREATE', 'merchant', $2, jsonb_build_object('name', $3::text, 'slug', $4::text, 'owner_membership_id', $5::uuid))`, merchant.ID, merchant.ID, merchant.Name, merchant.Slug, membershipID); err != nil {
		return MerchantUserProvisioning{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MerchantUserProvisioning{}, err
	}
	user, err := s.getUser(ctx, identityID, merchant.ID, membershipID)
	if err != nil {
		return MerchantUserProvisioning{}, err
	}
	return MerchantUserProvisioning{Merchant: merchant, User: user, Role: ownerRole}, nil
}

func (s *Service) UpdateUser(ctx context.Context, claims *Claims, membershipID string, request UpdateUserRequest) (User, error) {
	if membershipID == claims.MembershipID && request.IsActive != nil && !*request.IsActive {
		return User{}, app.NewError("VALIDATION_ERROR", "You cannot deactivate your own membership.", 400)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return User{}, err
	}
	var identityID string
	if err := tx.QueryRow(ctx, `SELECT identity_id FROM user_memberships WHERE id = $1 AND merchant_id = $2`, membershipID, claims.MerchantID).Scan(&identityID); err != nil {
		return User{}, err
	}
	if request.DisplayName != nil || request.Phone != nil || request.IsActive != nil || request.ShopID != nil {
		if request.ShopID != nil {
			var found bool
			if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM shops WHERE merchant_id=$1::uuid AND id=$2 AND is_active)`, claims.MerchantID, *request.ShopID).Scan(&found); err != nil {
				return User{}, err
			}
			if !found {
				return User{}, app.Validation("shop_id must reference an active shop in this merchant.", nil)
			}
		}
		_, err = tx.Exec(ctx, `UPDATE user_memberships SET display_name = COALESCE($3, display_name), phone = COALESCE($4, phone), is_active = COALESCE($5, is_active), shop_id=COALESCE($6,shop_id) WHERE id = $1 AND merchant_id = $2`, membershipID, claims.MerchantID, request.DisplayName, request.Phone, request.IsActive, request.ShopID)
		if err != nil {
			return User{}, err
		}
	}
	if request.Email != nil || request.Password != nil {
		var email any
		if request.Email != nil {
			normalized := strings.ToLower(strings.TrimSpace(*request.Email))
			email = normalized
		}
		var password any
		if request.Password != nil {
			hash, hashErr := bcrypt.GenerateFromPassword([]byte(*request.Password), s.bcryptCost)
			if hashErr != nil {
				return User{}, hashErr
			}
			password = string(hash)
		}
		_, err = tx.Exec(ctx, `UPDATE user_identities SET email = COALESCE($2, email), password_hash = COALESCE($3, password_hash) WHERE id = $1`, identityID, email, password)
		if err != nil {
			return User{}, err
		}
	}
	if request.RoleIDs != nil {
		var assignsStaff bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM roles WHERE merchant_id=$1::uuid AND id=ANY($2::uuid[]) AND lower(code)='staff')`, claims.MerchantID, *request.RoleIDs).Scan(&assignsStaff); err != nil {
			return User{}, err
		}
		if assignsStaff {
			var effectiveShopID *string
			if err := tx.QueryRow(ctx, `SELECT COALESCE($3::uuid,shop_id) FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, membershipID, request.ShopID).Scan(&effectiveShopID); err != nil {
				return User{}, err
			}
			if effectiveShopID == nil {
				return User{}, app.Validation("Staff must be assigned to one shop.", map[string]any{"shop_id": "required"})
			}
		}
		if err := assignRoles(ctx, tx, claims.MerchantID, membershipID, *request.RoleIDs, claims.MembershipID); err != nil {
			return User{}, err
		}
	}
	if err := audit(ctx, tx, claims, "UPDATE", membershipID, nil, map[string]any{"membership_id": membershipID}); err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return s.getUser(ctx, identityID, claims.MerchantID, membershipID)
}

func (s *Service) DeleteUser(ctx context.Context, claims *Claims, membershipID string) *app.Error {
	if membershipID == claims.MembershipID {
		return app.NewError("VALIDATION_ERROR", "You cannot deactivate your own membership.", 400)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return app.Internal(err)
	}
	result, err := tx.Exec(ctx, `UPDATE user_memberships SET is_active = false WHERE id = $1 AND merchant_id = $2`, membershipID, claims.MerchantID)
	if err != nil {
		return app.Internal(err)
	}
	if result.RowsAffected() == 0 {
		return app.NewError("NOT_FOUND", "User not found.", 404)
	}
	if err := audit(ctx, tx, claims, "DELETE", membershipID, nil, map[string]any{"is_active": false}); err != nil {
		return app.Internal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return app.Internal(err)
	}
	return nil
}

func (s *Service) membershipsForIdentity(ctx context.Context, tx pgx.Tx, identityID string) ([]membership, error) {
	rows, err := tx.Query(ctx, `SELECT um.merchant_id, um.id, um.display_name, um.phone, um.shop_id, um.is_active, m.is_active FROM user_memberships um JOIN merchants m ON m.id = um.merchant_id WHERE um.identity_id = $1 ORDER BY um.created_at`, identityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var memberships []membership
	for rows.Next() {
		var item membership
		if err := rows.Scan(&item.merchantID, &item.id, &item.displayName, &item.phone, &item.shopID, &item.active, &item.merchantActive); err != nil {
			return nil, err
		}
		memberships = append(memberships, item)
	}
	return memberships, rows.Err()
}

type membership struct {
	merchantID, id, displayName string
	phone                       *string
	shopID                      *string
	active, merchantActive      bool
}

func selectMembership(memberships []membership, requested string) (string, string, string, *string, *string, bool, *app.Error) {
	if requested != "" {
		for _, item := range memberships {
			if item.merchantID == requested {
				return item.merchantID, item.id, item.displayName, item.phone, item.shopID, item.active && item.merchantActive, nil
			}
		}
		return "", "", "", nil, nil, false, app.NewError("UNAUTHENTICATED", "Invalid email or password.", 401)
	}
	if len(memberships) == 0 {
		return "", "", "", nil, nil, false, app.NewError("UNAUTHENTICATED", "Invalid email or password.", 401)
	}
	if len(memberships) > 1 {
		return "", "", "", nil, nil, false, &app.Error{Code: "VALIDATION_ERROR", Message: "merchant_id is required when the user belongs to multiple merchants.", Status: 400, Fields: map[string]any{"merchant_id": "required"}}
	}
	item := memberships[0]
	return item.merchantID, item.id, item.displayName, item.phone, item.shopID, item.active && item.merchantActive, nil
}

func (s *Service) rolesForMembership(ctx context.Context, identityID, merchantID, membershipID string) ([]Role, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.user_id', $1, true), set_config('app.merchant_id', $2, true)`, identityID, merchantID); err != nil {
		return nil, err
	}
	roles, err := s.rolesForMembershipTx(ctx, tx, merchantID, membershipID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return roles, nil
}

func (s *Service) rolesForMembershipTx(ctx context.Context, tx pgx.Tx, merchantID, membershipID string) ([]Role, error) {
	rows, err := tx.Query(ctx, `SELECT r.id, r.code, r.name, r.is_system, ARRAY(SELECT rp.permission_code FROM role_permissions rp WHERE rp.role_id = r.id ORDER BY rp.permission_code) FROM membership_roles mr JOIN roles r ON r.merchant_id = mr.merchant_id AND r.id = mr.role_id WHERE mr.merchant_id = $1 AND mr.membership_id = $2 AND (mr.valid_until IS NULL OR mr.valid_until >= now()) ORDER BY r.code`, merchantID, membershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := make([]Role, 0)
	for rows.Next() {
		var role Role
		if err := rows.Scan(&role.ID, &role.Code, &role.Name, &role.IsSystem, &role.PermissionCodes); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func (s *Service) getUser(ctx context.Context, identityID, merchantID, membershipID string) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.user_id', $1, true), set_config('app.merchant_id', $2, true)`, identityID, merchantID); err != nil {
		return User{}, err
	}
	var user User
	err = tx.QueryRow(ctx, `SELECT um.id, um.identity_id, um.merchant_id, i.email, um.display_name, um.phone, um.shop_id, um.is_active, um.created_at, um.updated_at FROM user_memberships um JOIN user_identities i ON i.id = um.identity_id WHERE um.id = $1 AND um.merchant_id = $2`, membershipID, merchantID).Scan(&user.MembershipID, &user.ID, &user.MerchantID, &user.Email, &user.DisplayName, &user.Phone, &user.ShopID, &user.IsActive, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return User{}, err
	}
	user.Roles, err = s.rolesForMembershipTx(ctx, tx, merchantID, membershipID)
	if err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Service) getPlatformAdminUser(ctx context.Context, identityID string) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.user_id', $1, true)`, identityID); err != nil {
		return User{}, err
	}
	var user User
	err = tx.QueryRow(ctx, `SELECT id, email, is_active, created_at, updated_at FROM user_identities WHERE id = $1`, identityID).Scan(&user.ID, &user.Email, &user.IsActive, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return User{}, err
	}
	user.DisplayName = user.Email
	user.PlatformAdmin = true
	user.Roles = []Role{}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return user, nil
}

func setContext(ctx context.Context, tx pgx.Tx, claims *Claims) error {
	_, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', '', true), set_config('app.user_id', $1, true), set_config('app.merchant_id', $2, true)`, claims.IdentityID, claims.MerchantID)
	return err
}

func assignRoles(ctx context.Context, tx pgx.Tx, merchantID, membershipID string, roleIDs []string, grantedBy string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM membership_roles WHERE merchant_id = $1 AND membership_id = $2`, merchantID, membershipID); err != nil {
		return err
	}
	var grantedByValue any
	if grantedBy != "" {
		grantedByValue = grantedBy
	}
	for _, roleID := range roleIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO membership_roles(merchant_id, membership_id, role_id, granted_by_membership_id) VALUES ($1, $2, $3, $4)`, merchantID, membershipID, roleID, grantedByValue); err != nil {
			return err
		}
	}
	return nil
}

func audit(ctx context.Context, tx pgx.Tx, claims *Claims, action, entityID string, before, after map[string]any) error {
	var actorMembership any
	if claims.MembershipID != "" {
		actorMembership = claims.MembershipID
	}
	_, err := tx.Exec(ctx, `INSERT INTO audit_events(merchant_id, actor_membership_id, action, entity_type, entity_id, before_data, after_data) VALUES ($1, $2, $3, 'user_membership', $4, $5, $6)`, claims.MerchantID, actorMembership, action, entityID, before, after)
	return err
}

func (s *Service) issueAccessToken(identityID, merchantID, membershipID string, platformAdmin bool) (string, time.Time, error) {
	expiresAt := time.Now().UTC().Add(s.accessTokenTTL)
	claims := Claims{IdentityID: identityID, MerchantID: merchantID, MembershipID: membershipID, PlatformAdmin: platformAdmin, RegisteredClaims: jwt.RegisteredClaims{Subject: identityID, Issuer: "business-central-backend", IssuedAt: jwt.NewNumericDate(time.Now().UTC()), ExpiresAt: jwt.NewNumericDate(expiresAt), ID: uuid.NewString()}}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	raw, err := token.SignedString(s.secret)
	return raw, expiresAt, err
}

func newRefreshToken() (string, string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(bytes)
	return raw, hashToken(raw), nil
}

func hashToken(raw string) string {
	digest := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(digest[:])
}

// Repository adapts PostgreSQL persistence to the bounded context's outbound port.
type Repository = Service

func NewRepository(pool *pgxpool.Pool, secret []byte, accessTokenTTL, refreshTokenTTL time.Duration, bcryptCost int) *Service {
	return NewService(pool, secret, accessTokenTTL, refreshTokenTTL, bcryptCost)
}

var _ authoutbound.Repository = (*Service)(nil)
