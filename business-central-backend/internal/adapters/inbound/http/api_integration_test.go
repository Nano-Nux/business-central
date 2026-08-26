package http

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	listapp "business-central-backend/internal/app"
	"business-central-backend/internal/auth"
	authapp "business-central-backend/internal/auth/application"
	catalogpostgres "business-central-backend/internal/catalog/adapters/outbound/postgres"
	catalogapp "business-central-backend/internal/catalog/application"
	"business-central-backend/internal/database"
	operationspostgres "business-central-backend/internal/operations/adapters/outbound/postgres"
	operationsapp "business-central-backend/internal/operations/application"
	pospostgres "business-central-backend/internal/pos/adapters/outbound/postgres"
	posapp "business-central-backend/internal/pos/application"
	reportspostgres "business-central-backend/internal/reports/adapters/outbound/postgres"
	reportsapp "business-central-backend/internal/reports/application"
	servicespostgres "business-central-backend/internal/services/adapters/outbound/postgres"
	servicesapp "business-central-backend/internal/services/application"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func testDependencies(service *auth.Service, pool *pgxpool.Pool) Dependencies {
	return Dependencies{
		Authentication: authapp.NewService(service),
		Catalog:        catalogapp.NewService(catalogpostgres.NewRepository(pool)),
		POS:            posapp.NewService(pospostgres.NewRepository(pool)),
		Operations:     operationsapp.NewService(operationspostgres.NewRepository(pool)),
		Reports:        reportsapp.NewService(reportspostgres.NewRepository(pool)),
		Services:       servicesapp.NewService(servicespostgres.NewRepository(pool)),
	}
}

func TestSwaggerRoutes(t *testing.T) {
	docsRoot, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "docs"))
	if err != nil {
		t.Fatal(err)
	}
	app := NewWithDocs(nil, Dependencies{}, docsRoot).App()
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/swagger/", nil))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("swagger status = %d", response.StatusCode)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(body, []byte("SwaggerUIBundle")) {
		t.Fatal("swagger UI bundle was not served")
	}
}

func TestCORSAllowsAllOriginsByDefault(t *testing.T) {
	docsRoot, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "docs"))
	if err != nil {
		t.Fatal(err)
	}
	app := NewWithDocs(nil, Dependencies{}, docsRoot).App()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("allow-origin = %q", response.Header.Get("Access-Control-Allow-Origin"))
	}
}

func TestConfiguredDatabaseUserAPI(t *testing.T) {
	if os.Getenv("RUN_API_DB_TESTS") != "1" {
		t.Skip("set RUN_API_DB_TESTS=1 to run the API/database integration test")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("DATABASE_URL is required when RUN_API_DB_TESTS=1")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}

	seed, err := seedUserAPIData(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanupUserAPIData(context.Background(), pool, seed)

	service := auth.NewService(pool, []byte("api-integration-test-secret-1234567890"), 15*time.Minute, time.Hour, 10)
	app := New(pool, testDependencies(service, pool)).App()

	loginResponse := requestJSON(t, app, http.MethodPost, "/api/v1/auth/login", map[string]any{
		"email": seed.email, "password": seed.password, "merchant_id": seed.merchantID,
	}, "")
	if loginResponse.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, body = %s", loginResponse.StatusCode, responseBody(loginResponse))
	}
	var loginBody struct {
		Data auth.Session `json:"data"`
	}
	decodeResponse(t, loginResponse, &loginBody)
	if loginBody.Data.AccessToken == "" {
		t.Fatal("login did not return an access token")
	}

	meResponse := requestJSON(t, app, http.MethodGet, "/api/v1/auth/me", nil, loginBody.Data.AccessToken)
	if meResponse.StatusCode != http.StatusOK {
		t.Fatalf("me status = %d, body = %s", meResponse.StatusCode, responseBody(meResponse))
	}

	createResponse := requestJSON(t, app, http.MethodPost, "/api/v1/users", map[string]any{
		"email": "created-" + uuid.NewString() + "@example.test", "password": "Created-user-password-123", "display_name": "Created API User",
	}, loginBody.Data.AccessToken)
	if createResponse.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createResponse.StatusCode, responseBody(createResponse))
	}
	var created struct {
		Data auth.User `json:"data"`
	}
	decodeResponse(t, createResponse, &created)
	claims, parseErr := service.ParseAccessToken(loginBody.Data.AccessToken)
	if parseErr != nil {
		t.Fatal(parseErr)
	}
	if _, _, listErr := service.ListUsers(context.Background(), claims, listapp.NewListQuery("", "", 0, 25)); listErr != nil {
		t.Fatalf("direct list error: %v", listErr)
	}

	listResponse := requestJSON(t, app, http.MethodGet, "/api/v1/users?page=1&page_size=25", nil, loginBody.Data.AccessToken)
	if listResponse.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", listResponse.StatusCode, responseBody(listResponse))
	}
	for _, path := range []string{
		"/api/v1/reports/sales-summary",
		"/api/v1/reports/profit-summary",
		"/api/v1/reports/sales-by-day?page_index=0&page_size=10",
		"/api/v1/reports/top-products?page_index=0&page_size=10",
		"/api/v1/transaction-history?page_index=0&page_size=10",
		"/api/v1/services/categories?page_index=0&page_size=10",
		"/api/v1/services/catalog?page_index=0&page_size=10",
		"/api/v1/services/prices?page_index=0&page_size=10",
		"/api/v1/services/orders?page_index=0&page_size=10",
		"/api/v1/repairs/devices?page_index=0&page_size=10",
		"/api/v1/repairs/orders?page_index=0&page_size=10",
	} {
		response := requestJSON(t, app, http.MethodGet, path, nil, loginBody.Data.AccessToken)
		if response.StatusCode != http.StatusOK {
			if path == "/api/v1/services/categories?page_index=0&page_size=10" {
				serviceRepository := servicespostgres.NewRepository(pool)
				if _, _, directErr := serviceRepository.ListServiceCategories(context.Background(), claims, listapp.NewListQuery("", "", 0, 10)); directErr != nil {
					t.Fatalf("new listing %s status = %d, direct error = %v, body = %s", path, response.StatusCode, directErr, responseBody(response))
				}
			}
			t.Fatalf("new listing %s status = %d, body = %s", path, response.StatusCode, responseBody(response))
		}
	}

	updateResponse := requestJSON(t, app, http.MethodPatch, "/api/v1/users/"+created.Data.MembershipID, map[string]any{"display_name": "Updated API User"}, loginBody.Data.AccessToken)
	if updateResponse.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", updateResponse.StatusCode, responseBody(updateResponse))
	}

	deleteResponse := requestJSON(t, app, http.MethodDelete, "/api/v1/users/"+created.Data.MembershipID, nil, loginBody.Data.AccessToken)
	if deleteResponse.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, body = %s", deleteResponse.StatusCode, responseBody(deleteResponse))
	}
}

func TestConfiguredDatabasePlatformAdminCreatesMerchant(t *testing.T) {
	if os.Getenv("RUN_API_DB_TESTS") != "1" {
		t.Skip("set RUN_API_DB_TESTS=1 to run the API/database integration test")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("DATABASE_URL is required when RUN_API_DB_TESTS=1")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO currencies(code, name, decimal_places) VALUES ('TST', 'Test Currency', 2) ON CONFLICT (code) DO NOTHING`); err != nil {
		t.Fatal(err)
	}

	adminEmail := "platform-admin-" + uuid.NewString() + "@example.test"
	adminPassword := "Platform-admin-password-123"
	ownerEmail := "merchant-owner-" + uuid.NewString() + "@example.test"
	managerEmail := "merchant-manager-" + uuid.NewString() + "@example.test"
	staffEmail := "merchant-staff-" + uuid.NewString() + "@example.test"
	merchantSlug := "merchant-" + uuid.NewString()
	ownerMerchantSlug := "owner-merchant-" + uuid.NewString()
	currencyUUID := uuid.New()
	currencyCode := string([]byte{byte('A' + currencyUUID[0]%26), byte('A' + currencyUUID[1]%26), byte('A' + currencyUUID[2]%26)})
	service := auth.NewService(pool, []byte("api-platform-admin-test-secret-123456"), 15*time.Minute, time.Hour, 10)
	if err := service.BootstrapPlatformAdmin(ctx, adminEmail, adminPassword); err != nil {
		t.Fatal(err)
	}
	app := New(pool, testDependencies(service, pool)).App()
	defer func() {
		cleanup, cleanupErr := pool.Begin(context.Background())
		if cleanupErr != nil {
			return
		}
		defer cleanup.Rollback(context.Background())
		if _, cleanupErr = cleanup.Exec(context.Background(), `SET LOCAL row_security = off`); cleanupErr != nil {
			return
		}
		_, _ = cleanup.Exec(context.Background(), `DELETE FROM merchants WHERE slug IN ($1, $2)`, merchantSlug, ownerMerchantSlug)
		_, _ = cleanup.Exec(context.Background(), `DELETE FROM currencies WHERE code = $1`, currencyCode)
		_, _ = cleanup.Exec(context.Background(), `DELETE FROM user_identities WHERE email IN ($1, $2, $3, $4)`, adminEmail, ownerEmail, managerEmail, staffEmail)
		_ = cleanup.Commit(context.Background())
	}()

	loginResponse := requestJSON(t, app, http.MethodPost, "/api/v1/auth/login", map[string]any{"email": adminEmail, "password": adminPassword}, "")
	if loginResponse.StatusCode != http.StatusOK {
		t.Fatalf("platform admin login status = %d, body = %s", loginResponse.StatusCode, responseBody(loginResponse))
	}
	var loginBody struct {
		Data auth.Session `json:"data"`
	}
	decodeResponse(t, loginResponse, &loginBody)
	if !loginBody.Data.User.PlatformAdmin || loginBody.Data.User.MerchantID != "" {
		t.Fatalf("expected merchantless platform-admin session: %+v", loginBody.Data.User)
	}
	onboardResponse := requestJSON(t, app, http.MethodPost, "/api/v1/admin/merchant-users", map[string]any{
		"merchant_name": "Owner Integration Merchant", "merchant_slug": ownerMerchantSlug, "default_currency_code": "TST",
		"email": ownerEmail, "password": "Merchant-owner-password-123", "display_name": "Integration Owner",
	}, loginBody.Data.AccessToken)
	if onboardResponse.StatusCode != http.StatusCreated {
		t.Fatalf("merchant owner creation status = %d, body = %s", onboardResponse.StatusCode, responseBody(onboardResponse))
	}
	var onboardBody struct {
		Data auth.MerchantUserProvisioning `json:"data"`
	}
	decodeResponse(t, onboardResponse, &onboardBody)
	if onboardBody.Data.Merchant.Slug != ownerMerchantSlug || onboardBody.Data.User.Email != ownerEmail || onboardBody.Data.Role.Code != "merchant" {
		t.Fatalf("unexpected merchant owner provisioning: %+v", onboardBody.Data)
	}
	currencyCreate := requestJSON(t, app, http.MethodPost, "/api/v1/admin/currencies", map[string]any{
		"code": currencyCode, "name": "Integration Currency", "symbol": "¤", "decimal_places": 2,
	}, loginBody.Data.AccessToken)
	if currencyCreate.StatusCode != http.StatusCreated {
		t.Fatalf("currency creation status = %d, body = %s", currencyCreate.StatusCode, responseBody(currencyCreate))
	}
	currencyGet := requestJSON(t, app, http.MethodGet, "/api/v1/admin/currencies/"+currencyCode, nil, loginBody.Data.AccessToken)
	if currencyGet.StatusCode != http.StatusOK {
		t.Fatalf("currency get status = %d, body = %s", currencyGet.StatusCode, responseBody(currencyGet))
	}
	currencyUpdate := requestJSON(t, app, http.MethodPatch, "/api/v1/admin/currencies/"+currencyCode, map[string]any{"name": "Updated Integration Currency"}, loginBody.Data.AccessToken)
	if currencyUpdate.StatusCode != http.StatusOK {
		t.Fatalf("currency update status = %d, body = %s", currencyUpdate.StatusCode, responseBody(currencyUpdate))
	}
	currencyDelete := requestJSON(t, app, http.MethodDelete, "/api/v1/admin/currencies/"+currencyCode, nil, loginBody.Data.AccessToken)
	if currencyDelete.StatusCode != http.StatusNoContent {
		t.Fatalf("currency delete status = %d, body = %s", currencyDelete.StatusCode, responseBody(currencyDelete))
	}
	createResponse := requestJSON(t, app, http.MethodPost, "/api/v1/admin/merchants", map[string]any{
		"name": "Integration Merchant", "slug": merchantSlug, "default_currency_code": "TST", "pos_complexity_level": "COMPLEX",
	}, loginBody.Data.AccessToken)
	if createResponse.StatusCode != http.StatusCreated {
		t.Fatalf("merchant creation status = %d, body = %s", createResponse.StatusCode, responseBody(createResponse))
	}
	var account struct {
		Data auth.MerchantProvisioning `json:"data"`
	}
	decodeResponse(t, createResponse, &account)
	if len(account.Data.Roles) != 2 {
		t.Fatalf("expected default manager and staff roles, got %+v", account.Data.Roles)
	}
	var managerRoleID string
	for _, role := range account.Data.Roles {
		if role.Code == "manager" {
			managerRoleID = role.ID
		}
	}
	if managerRoleID == "" {
		t.Fatalf("manager role was not provisioned: %+v", account.Data.Roles)
	}
	roleCreate := requestJSON(t, app, http.MethodPost, "/api/v1/admin/merchants/"+account.Data.Merchant.ID+"/roles", map[string]any{
		"code": "auditor", "name": "Auditor", "permission_codes": []string{"tenant.read"},
	}, loginBody.Data.AccessToken)
	if roleCreate.StatusCode != http.StatusCreated {
		t.Fatalf("role creation status = %d, body = %s", roleCreate.StatusCode, responseBody(roleCreate))
	}
	var roleBody struct {
		Data auth.Role `json:"data"`
	}
	decodeResponse(t, roleCreate, &roleBody)
	if roleBody.Data.Code != "auditor" || len(roleBody.Data.PermissionCodes) != 1 {
		t.Fatalf("unexpected created role: %+v", roleBody.Data)
	}
	roleGet := requestJSON(t, app, http.MethodGet, "/api/v1/admin/merchants/"+account.Data.Merchant.ID+"/roles/"+roleBody.Data.ID, nil, loginBody.Data.AccessToken)
	if roleGet.StatusCode != http.StatusOK {
		t.Fatalf("role get status = %d, body = %s", roleGet.StatusCode, responseBody(roleGet))
	}
	roleList := requestJSON(t, app, http.MethodGet, "/api/v1/admin/merchants/"+account.Data.Merchant.ID+"/roles", nil, loginBody.Data.AccessToken)
	if roleList.StatusCode != http.StatusOK {
		t.Fatalf("role list status = %d, body = %s", roleList.StatusCode, responseBody(roleList))
	}
	roleUpdate := requestJSON(t, app, http.MethodPatch, "/api/v1/admin/merchants/"+account.Data.Merchant.ID+"/roles/"+roleBody.Data.ID, map[string]any{
		"name": "Store Auditor", "permission_codes": []string{"tenant.read", "membership.manage"},
	}, loginBody.Data.AccessToken)
	if roleUpdate.StatusCode != http.StatusOK {
		t.Fatalf("role update status = %d, body = %s", roleUpdate.StatusCode, responseBody(roleUpdate))
	}
	permissionsResponse := requestJSON(t, app, http.MethodGet, "/api/v1/admin/permissions", nil, loginBody.Data.AccessToken)
	if permissionsResponse.StatusCode != http.StatusOK {
		t.Fatalf("permission list status = %d, body = %s", permissionsResponse.StatusCode, responseBody(permissionsResponse))
	}
	roleDelete := requestJSON(t, app, http.MethodDelete, "/api/v1/admin/merchants/"+account.Data.Merchant.ID+"/roles/"+roleBody.Data.ID, nil, loginBody.Data.AccessToken)
	if roleDelete.StatusCode != http.StatusNoContent {
		t.Fatalf("role delete status = %d, body = %s", roleDelete.StatusCode, responseBody(roleDelete))
	}
	managerCreate := requestJSONWithHeaders(t, app, http.MethodPost, "/api/v1/users", map[string]any{
		"email": managerEmail, "password": "Merchant-manager-password-123", "display_name": "Integration Manager",
		"role_ids": []string{managerRoleID},
	}, loginBody.Data.AccessToken, map[string]string{"X-Merchant-ID": account.Data.Merchant.ID})
	if managerCreate.StatusCode != http.StatusCreated {
		t.Fatalf("manager creation status = %d, body = %s", managerCreate.StatusCode, responseBody(managerCreate))
	}
	var staffRoleID string
	for _, role := range account.Data.Roles {
		if role.Code == "staff" {
			staffRoleID = role.ID
		}
	}

	managerLogin := requestJSON(t, app, http.MethodPost, "/api/v1/auth/login", map[string]any{"email": managerEmail, "password": "Merchant-manager-password-123", "merchant_id": account.Data.Merchant.ID}, "")
	if managerLogin.StatusCode != http.StatusOK {
		t.Fatalf("manager login status = %d, body = %s", managerLogin.StatusCode, responseBody(managerLogin))
	}
	var managerSession struct {
		Data auth.Session `json:"data"`
	}
	decodeResponse(t, managerLogin, &managerSession)
	staffShopCreate := requestJSON(t, app, http.MethodPost, "/api/v1/shops", map[string]any{
		"name": "Staff Integration Shop", "code": "STAFF-" + uuid.NewString()[:8], "timezone": "UTC",
	}, managerSession.Data.AccessToken)
	if staffShopCreate.StatusCode != http.StatusCreated {
		t.Fatalf("staff shop creation status = %d, body = %s", staffShopCreate.StatusCode, responseBody(staffShopCreate))
	}
	var staffShopBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, staffShopCreate, &staffShopBody)
	staffCreate := requestJSON(t, app, http.MethodPost, "/api/v1/users", map[string]any{
		"email": staffEmail, "password": "Merchant-staff-password-123", "display_name": "Integration Staff",
		"role_ids": []string{staffRoleID}, "shop_id": staffShopBody.Data.ID,
	}, managerSession.Data.AccessToken)
	if staffCreate.StatusCode != http.StatusCreated {
		t.Fatalf("staff creation by merchant manager status = %d, body = %s", staffCreate.StatusCode, responseBody(staffCreate))
	}
	unitCode := "EA-" + uuid.NewString()[:8]
	unitCreate := requestJSON(t, app, http.MethodPost, "/api/v1/units", map[string]any{
		"code": unitCode, "name": "Each", "symbol": "ea", "dimension_code": "COUNT",
	}, managerSession.Data.AccessToken)
	if unitCreate.StatusCode != http.StatusCreated {
		t.Fatalf("unit creation status = %d, body = %s", unitCreate.StatusCode, responseBody(unitCreate))
	}
	var unitBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, unitCreate, &unitBody)
	secondUnitCreate := requestJSON(t, app, http.MethodPost, "/api/v1/units", map[string]any{
		"code": "BOX-" + uuid.NewString()[:8], "name": "Box", "dimension_code": "COUNT",
	}, managerSession.Data.AccessToken)
	if secondUnitCreate.StatusCode != http.StatusCreated {
		t.Fatalf("second unit creation status = %d, body = %s", secondUnitCreate.StatusCode, responseBody(secondUnitCreate))
	}
	var secondUnitBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, secondUnitCreate, &secondUnitBody)
	conversionCreate := requestJSON(t, app, http.MethodPost, "/api/v1/unit-conversions", map[string]any{
		"from_unit_id": unitBody.Data.ID, "to_unit_id": secondUnitBody.Data.ID, "multiplier": "12",
	}, managerSession.Data.AccessToken)
	if conversionCreate.StatusCode != http.StatusCreated {
		t.Fatalf("unit conversion creation status = %d, body = %s", conversionCreate.StatusCode, responseBody(conversionCreate))
	}
	productCreate := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/products", map[string]any{
		"name": "Integration Product", "product_type": "PHYSICAL",
	}, managerSession.Data.AccessToken)
	if productCreate.StatusCode != http.StatusCreated {
		t.Fatalf("product creation status = %d, body = %s", productCreate.StatusCode, responseBody(productCreate))
	}
	var productBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, productCreate, &productBody)
	variantCreate := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/products/"+productBody.Data.ID+"/variants", map[string]any{
		"sku": "SKU-" + uuid.NewString()[:8], "name": "Integration Variant", "base_unit_id": unitBody.Data.ID,
	}, managerSession.Data.AccessToken)
	if variantCreate.StatusCode != http.StatusCreated {
		t.Fatalf("variant creation status = %d, body = %s", variantCreate.StatusCode, responseBody(variantCreate))
	}
	var variantBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, variantCreate, &variantBody)
	unusedProductCreate := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/products", map[string]any{
		"name": "Disposable Integration Product", "product_type": "PHYSICAL",
	}, managerSession.Data.AccessToken)
	if unusedProductCreate.StatusCode != http.StatusCreated {
		t.Fatalf("disposable product creation status = %d, body = %s", unusedProductCreate.StatusCode, responseBody(unusedProductCreate))
	}
	var unusedProductBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, unusedProductCreate, &unusedProductBody)
	unusedVariantCreate := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/products/"+unusedProductBody.Data.ID+"/variants", map[string]any{
		"sku": "DISPOSABLE-" + uuid.NewString()[:8], "name": "Disposable Variant", "base_unit_id": unitBody.Data.ID,
	}, managerSession.Data.AccessToken)
	if unusedVariantCreate.StatusCode != http.StatusCreated {
		t.Fatalf("disposable variant creation status = %d, body = %s", unusedVariantCreate.StatusCode, responseBody(unusedVariantCreate))
	}
	unusedProductDelete := requestJSON(t, app, http.MethodDelete, "/api/v1/catalog/products/"+unusedProductBody.Data.ID, nil, managerSession.Data.AccessToken)
	if unusedProductDelete.StatusCode != http.StatusNoContent {
		t.Fatalf("unused product deletion status = %d, body = %s", unusedProductDelete.StatusCode, responseBody(unusedProductDelete))
	}
	brandCreate := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/brands", map[string]any{
		"name": "Integration Brand", "slug": "integration-brand-" + uuid.NewString()[:8],
	}, managerSession.Data.AccessToken)
	if brandCreate.StatusCode != http.StatusCreated {
		t.Fatalf("brand creation status = %d, body = %s", brandCreate.StatusCode, responseBody(brandCreate))
	}
	categoryCreate := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/categories", map[string]any{
		"name": "Integration Category", "slug": "integration-category-" + uuid.NewString()[:8],
	}, managerSession.Data.AccessToken)
	if categoryCreate.StatusCode != http.StatusCreated {
		t.Fatalf("category creation status = %d, body = %s", categoryCreate.StatusCode, responseBody(categoryCreate))
	}
	var categoryBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, categoryCreate, &categoryBody)
	categoryAssign := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/products/"+productBody.Data.ID+"/categories/"+categoryBody.Data.ID, nil, managerSession.Data.AccessToken)
	if categoryAssign.StatusCode != http.StatusNoContent {
		t.Fatalf("category assignment status = %d, body = %s", categoryAssign.StatusCode, responseBody(categoryAssign))
	}
	categorizedProductCreate := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/products", map[string]any{
		"name": "Categorized Integration Product", "product_type": "PHYSICAL", "category_ids": []string{categoryBody.Data.ID},
	}, managerSession.Data.AccessToken)
	if categorizedProductCreate.StatusCode != http.StatusCreated {
		t.Fatalf("categorized product creation status = %d, body = %s", categorizedProductCreate.StatusCode, responseBody(categorizedProductCreate))
	}
	var categorizedProductBody struct {
		Data struct {
			ID          string   `json:"id"`
			CategoryIDs []string `json:"category_ids"`
		} `json:"data"`
	}
	decodeResponse(t, categorizedProductCreate, &categorizedProductBody)
	if len(categorizedProductBody.Data.CategoryIDs) != 1 || categorizedProductBody.Data.CategoryIDs[0] != categoryBody.Data.ID {
		t.Fatalf("product creation did not return its category assignment: %+v", categorizedProductBody.Data.CategoryIDs)
	}
	categorizedProductGet := requestJSON(t, app, http.MethodGet, "/api/v1/catalog/products/"+categorizedProductBody.Data.ID, nil, managerSession.Data.AccessToken)
	if categorizedProductGet.StatusCode != http.StatusOK {
		t.Fatalf("categorized product get status = %d, body = %s", categorizedProductGet.StatusCode, responseBody(categorizedProductGet))
	}
	var categorizedProductGetBody struct {
		Data struct {
			CategoryIDs   []string `json:"category_ids"`
			CategoryNames []string `json:"category_names"`
		} `json:"data"`
	}
	decodeResponse(t, categorizedProductGet, &categorizedProductGetBody)
	if len(categorizedProductGetBody.Data.CategoryIDs) != 1 || len(categorizedProductGetBody.Data.CategoryNames) != 1 || categorizedProductGetBody.Data.CategoryNames[0] != "Integration Category" {
		t.Fatalf("product category read is incomplete: %+v", categorizedProductGetBody.Data)
	}
	categorizedProductUpdate := requestJSON(t, app, http.MethodPatch, "/api/v1/catalog/products/"+categorizedProductBody.Data.ID, map[string]any{
		"name": "Categorized Integration Product", "product_type": "PHYSICAL", "is_active": true, "category_ids": []string{},
	}, managerSession.Data.AccessToken)
	if categorizedProductUpdate.StatusCode != http.StatusOK {
		t.Fatalf("categorized product update status = %d, body = %s", categorizedProductUpdate.StatusCode, responseBody(categorizedProductUpdate))
	}
	categorizedProductAfterUpdate := requestJSON(t, app, http.MethodGet, "/api/v1/catalog/products/"+categorizedProductBody.Data.ID, nil, managerSession.Data.AccessToken)
	if categorizedProductAfterUpdate.StatusCode != http.StatusOK {
		t.Fatalf("updated product get status = %d, body = %s", categorizedProductAfterUpdate.StatusCode, responseBody(categorizedProductAfterUpdate))
	}
	var categorizedProductAfterUpdateBody struct {
		Data struct {
			CategoryIDs []string `json:"category_ids"`
		} `json:"data"`
	}
	decodeResponse(t, categorizedProductAfterUpdate, &categorizedProductAfterUpdateBody)
	if len(categorizedProductAfterUpdateBody.Data.CategoryIDs) != 0 {
		t.Fatalf("product category removal was not persisted: %+v", categorizedProductAfterUpdateBody.Data.CategoryIDs)
	}
	imageCreate := requestJSON(t, app, http.MethodPost, "/api/v1/catalog/products/"+productBody.Data.ID+"/images", map[string]any{
		"image_url": "https://example.test/integration.png", "alt_text": "Integration image",
	}, managerSession.Data.AccessToken)
	if imageCreate.StatusCode != http.StatusCreated {
		t.Fatalf("image creation status = %d, body = %s", imageCreate.StatusCode, responseBody(imageCreate))
	}
	policyCreate := requestJSON(t, app, http.MethodPut, "/api/v1/catalog/variants/"+variantBody.Data.ID+"/inventory-policy", map[string]any{
		"track_batches": true, "track_expiry": true,
	}, managerSession.Data.AccessToken)
	if policyCreate.StatusCode != http.StatusOK {
		t.Fatalf("inventory policy status = %d, body = %s", policyCreate.StatusCode, responseBody(policyCreate))
	}
	priceListCreate := requestJSON(t, app, http.MethodPost, "/api/v1/pricing/price-lists", map[string]any{
		"code": "RETAIL-" + uuid.NewString()[:8], "currency_code": "TST", "is_default": true,
	}, managerSession.Data.AccessToken)
	if priceListCreate.StatusCode != http.StatusCreated {
		t.Fatalf("price list creation status = %d, body = %s", priceListCreate.StatusCode, responseBody(priceListCreate))
	}
	promotionCreate := requestJSON(t, app, http.MethodPost, "/api/v1/promotions", map[string]any{
		"name": "Integration Promotion", "promotion_type": "PERCENTAGE", "value": "10", "minimum_subtotal": "0",
	}, managerSession.Data.AccessToken)
	if promotionCreate.StatusCode != http.StatusCreated {
		t.Fatalf("promotion creation status = %d, body = %s", promotionCreate.StatusCode, responseBody(promotionCreate))
	}
	movements := requestJSON(t, app, http.MethodGet, "/api/v1/inventory/movements", nil, managerSession.Data.AccessToken)
	if movements.StatusCode != http.StatusOK {
		t.Fatalf("movement history status = %d, body = %s", movements.StatusCode, responseBody(movements))
	}
	shopCode := "SHOP-" + uuid.NewString()[:8]
	shopCreate := requestJSON(t, app, http.MethodPost, "/api/v1/shops", map[string]any{
		"name": "Integration Shop", "code": shopCode, "timezone": "UTC",
	}, managerSession.Data.AccessToken)
	if shopCreate.StatusCode != http.StatusCreated {
		t.Fatalf("shop creation status = %d, body = %s", shopCreate.StatusCode, responseBody(shopCreate))
	}
	var shopBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, shopCreate, &shopBody)
	shopUpdate := requestJSON(t, app, http.MethodPatch, "/api/v1/shops/"+shopBody.Data.ID, map[string]any{
		"name": "Updated Integration Shop", "code": shopCode, "address": map[string]any{"city": "Integration City"}, "timezone": "Asia/Bangkok", "is_active": true,
	}, managerSession.Data.AccessToken)
	if shopUpdate.StatusCode != http.StatusOK {
		t.Fatalf("shop update status = %d, body = %s", shopUpdate.StatusCode, responseBody(shopUpdate))
	}
	shopList := requestJSON(t, app, http.MethodGet, "/api/v1/shops", nil, managerSession.Data.AccessToken)
	if shopList.StatusCode != http.StatusOK {
		t.Fatalf("shop list status = %d, body = %s", shopList.StatusCode, responseBody(shopList))
	}
	locationList := requestJSON(t, app, http.MethodGet, "/api/v1/inventory/locations", nil, managerSession.Data.AccessToken)
	if locationList.StatusCode != http.StatusOK {
		t.Fatalf("location list status = %d, body = %s", locationList.StatusCode, responseBody(locationList))
	}
	var locationBody struct {
		Data []struct {
			ID     string `json:"id"`
			ShopID string `json:"shop_id"`
		} `json:"data"`
	}
	decodeResponse(t, locationList, &locationBody)
	var stockLocationID string
	for _, location := range locationBody.Data {
		if location.ShopID == shopBody.Data.ID {
			stockLocationID = location.ID
			break
		}
	}
	if stockLocationID == "" {
		t.Fatal("shop creation did not provision an inventory location")
	}

	directEventKey := "direct-stock-in:" + uuid.NewString()
	batchTrackedStockIn := requestJSON(t, app, http.MethodPost, "/api/v1/inventory/stock-in", map[string]any{
		"variant_id": variantBody.Data.ID, "destination_location_id": stockLocationID,
		"unit_id": unitBody.Data.ID, "quantity": "5", "unit_cost": "12.34", "event_key": directEventKey,
	}, managerSession.Data.AccessToken)
	if batchTrackedStockIn.StatusCode != http.StatusBadRequest {
		t.Fatalf("batch-tracked direct stock-in status = %d, body = %s", batchTrackedStockIn.StatusCode, responseBody(batchTrackedStockIn))
	}
	policyDisableBatch := requestJSON(t, app, http.MethodPut, "/api/v1/catalog/variants/"+variantBody.Data.ID+"/inventory-policy", map[string]any{
		"track_batches": false, "track_expiry": false,
	}, managerSession.Data.AccessToken)
	if policyDisableBatch.StatusCode != http.StatusOK {
		t.Fatalf("inventory policy update status = %d, body = %s", policyDisableBatch.StatusCode, responseBody(policyDisableBatch))
	}
	firstStockInWithoutCost := requestJSON(t, app, http.MethodPost, "/api/v1/inventory/stock-in", map[string]any{
		"variant_id": variantBody.Data.ID, "destination_location_id": stockLocationID,
		"unit_id": unitBody.Data.ID, "quantity": "1", "event_key": "direct-stock-in:" + uuid.NewString(),
	}, managerSession.Data.AccessToken)
	if firstStockInWithoutCost.StatusCode != http.StatusBadRequest {
		t.Fatalf("first stock-in without cost status = %d, body = %s", firstStockInWithoutCost.StatusCode, responseBody(firstStockInWithoutCost))
	}
	stockInRequest := map[string]any{
		"variant_id": variantBody.Data.ID, "destination_location_id": stockLocationID,
		"unit_id": unitBody.Data.ID, "quantity": "5", "unit_cost": "12.34", "event_key": directEventKey,
	}
	stockIn := requestJSON(t, app, http.MethodPost, "/api/v1/inventory/stock-in", stockInRequest, managerSession.Data.AccessToken)
	if stockIn.StatusCode != http.StatusCreated {
		t.Fatalf("direct stock-in status = %d, body = %s", stockIn.StatusCode, responseBody(stockIn))
	}
	var stockInBody struct {
		Data struct {
			ID            string  `json:"id"`
			MovementType  string  `json:"movement_type"`
			Quantity      string  `json:"quantity"`
			UnitCost      *string `json:"unit_cost"`
			ReceiptLineID *string `json:"receipt_line_id"`
		} `json:"data"`
	}
	decodeResponse(t, stockIn, &stockInBody)
	if stockInBody.Data.MovementType != "RECEIPT" || stockInBody.Data.ReceiptLineID != nil || stockInBody.Data.UnitCost == nil || *stockInBody.Data.UnitCost != "12.34" {
		t.Fatalf("unexpected direct stock-in response: %+v", stockInBody.Data)
	}
	idempotentStockIn := requestJSON(t, app, http.MethodPost, "/api/v1/inventory/stock-in", stockInRequest, managerSession.Data.AccessToken)
	if idempotentStockIn.StatusCode != http.StatusCreated {
		t.Fatalf("idempotent stock-in status = %d, body = %s", idempotentStockIn.StatusCode, responseBody(idempotentStockIn))
	}
	var idempotentBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, idempotentStockIn, &idempotentBody)
	if idempotentBody.Data.ID != stockInBody.Data.ID {
		t.Fatalf("idempotent stock-in created a different movement: first=%s second=%s", stockInBody.Data.ID, idempotentBody.Data.ID)
	}

	assertionTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer assertionTx.Rollback(ctx)
	if _, err = assertionTx.Exec(ctx, `SET LOCAL row_security = off`); err != nil {
		t.Fatal(err)
	}
	var balance, layerReceived, layerRemaining, layerCost string
	var movementCount int
	if err = assertionTx.QueryRow(ctx, `SELECT quantity_on_hand::text FROM inventory_balances WHERE merchant_id=$1 AND location_id=$2 AND variant_id=$3`, account.Data.Merchant.ID, stockLocationID, variantBody.Data.ID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if err = assertionTx.QueryRow(ctx, `SELECT quantity_received::text,quantity_remaining::text,unit_cost::text FROM inventory_cost_layers WHERE merchant_id=$1 AND receipt_movement_id=$2`, account.Data.Merchant.ID, stockInBody.Data.ID).Scan(&layerReceived, &layerRemaining, &layerCost); err != nil {
		t.Fatal(err)
	}
	if err = assertionTx.QueryRow(ctx, `SELECT count(*) FROM inventory_movements WHERE merchant_id=$1 AND event_key=$2`, account.Data.Merchant.ID, directEventKey).Scan(&movementCount); err != nil {
		t.Fatal(err)
	}
	if balance != "5.000000" || layerReceived != "5.000000" || layerRemaining != "5.000000" || layerCost != "12.34" || movementCount != 1 {
		t.Fatalf("unexpected direct stock ledger: balance=%s received=%s remaining=%s cost=%s movements=%d", balance, layerReceived, layerRemaining, layerCost, movementCount)
	}
	if err = assertionTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	purchaseSeedTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer purchaseSeedTx.Rollback(ctx)
	if _, err = purchaseSeedTx.Exec(ctx, `SET LOCAL row_security = off`); err != nil {
		t.Fatal(err)
	}
	var supplierID, purchaseOrderID, purchaseOrderLineID string
	if err = purchaseSeedTx.QueryRow(ctx, `INSERT INTO suppliers(merchant_id,name,supplier_code) VALUES($1,'Integration Supplier',$2) RETURNING id`, account.Data.Merchant.ID, "SUP-"+uuid.NewString()[:8]).Scan(&supplierID); err != nil {
		t.Fatal(err)
	}
	if err = purchaseSeedTx.QueryRow(ctx, `INSERT INTO purchase_orders(merchant_id,supplier_id,destination_location_id,order_number,status,ordered_at,currency_code,total_amount) VALUES($1,$2,$3,$4,'ISSUED',now(),'TST',24.68) RETURNING id`, account.Data.Merchant.ID, supplierID, stockLocationID, "PO-"+uuid.NewString()[:8]).Scan(&purchaseOrderID); err != nil {
		t.Fatal(err)
	}
	if err = purchaseSeedTx.QueryRow(ctx, `INSERT INTO purchase_order_lines(merchant_id,purchase_order_id,variant_id,unit_id,quantity_ordered,unit_cost) VALUES($1,$2,$3,$4,2,12.34) RETURNING id`, account.Data.Merchant.ID, purchaseOrderID, variantBody.Data.ID, unitBody.Data.ID).Scan(&purchaseOrderLineID); err != nil {
		t.Fatal(err)
	}
	if err = purchaseSeedTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	purchaseEventKey := "purchase-stock-in:" + uuid.NewString()
	purchaseStockInRequest := map[string]any{
		"purchase_order_id": purchaseOrderID, "purchase_order_line_id": purchaseOrderLineID,
		"variant_id": variantBody.Data.ID, "destination_location_id": stockLocationID,
		"unit_id": unitBody.Data.ID, "receipt_number": "GR-" + uuid.NewString()[:8],
		"quantity": "2", "event_key": purchaseEventKey,
	}
	purchaseStockIn := requestJSON(t, app, http.MethodPost, "/api/v1/inventory/stock-in", purchaseStockInRequest, managerSession.Data.AccessToken)
	if purchaseStockIn.StatusCode != http.StatusCreated {
		t.Fatalf("purchase-order stock-in status = %d, body = %s", purchaseStockIn.StatusCode, responseBody(purchaseStockIn))
	}
	var purchaseStockInBody struct {
		Data struct {
			ID            string  `json:"id"`
			MovementType  string  `json:"movement_type"`
			ReceiptLineID *string `json:"receipt_line_id"`
		} `json:"data"`
	}
	decodeResponse(t, purchaseStockIn, &purchaseStockInBody)
	if purchaseStockInBody.Data.MovementType != "RECEIPT" || purchaseStockInBody.Data.ReceiptLineID == nil {
		t.Fatalf("purchase-order receipt lost its receipt-line link: %+v", purchaseStockInBody.Data)
	}
	purchaseStockInRetry := requestJSON(t, app, http.MethodPost, "/api/v1/inventory/stock-in", purchaseStockInRequest, managerSession.Data.AccessToken)
	if purchaseStockInRetry.StatusCode != http.StatusCreated {
		t.Fatalf("idempotent purchase-order stock-in status = %d, body = %s", purchaseStockInRetry.StatusCode, responseBody(purchaseStockInRetry))
	}
	var purchaseRetryBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, purchaseStockInRetry, &purchaseRetryBody)
	if purchaseRetryBody.Data.ID != purchaseStockInBody.Data.ID {
		t.Fatalf("purchase-order retry created another movement: first=%s second=%s", purchaseStockInBody.Data.ID, purchaseRetryBody.Data.ID)
	}

	purchaseAssertTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer purchaseAssertTx.Rollback(ctx)
	if _, err = purchaseAssertTx.Exec(ctx, `SET LOCAL row_security = off`); err != nil {
		t.Fatal(err)
	}
	var purchaseStatus, purchaseReceived, purchaseBalance, purchaseLayerQuantity, purchaseLayerCost string
	var goodsReceiptCount int
	if err = purchaseAssertTx.QueryRow(ctx, `SELECT po.status,pol.quantity_received::text FROM purchase_orders po JOIN purchase_order_lines pol ON pol.merchant_id=po.merchant_id AND pol.purchase_order_id=po.id WHERE po.merchant_id=$1 AND po.id=$2 AND pol.id=$3`, account.Data.Merchant.ID, purchaseOrderID, purchaseOrderLineID).Scan(&purchaseStatus, &purchaseReceived); err != nil {
		t.Fatal(err)
	}
	if err = purchaseAssertTx.QueryRow(ctx, `SELECT quantity_on_hand::text FROM inventory_balances WHERE merchant_id=$1 AND location_id=$2 AND variant_id=$3`, account.Data.Merchant.ID, stockLocationID, variantBody.Data.ID).Scan(&purchaseBalance); err != nil {
		t.Fatal(err)
	}
	if err = purchaseAssertTx.QueryRow(ctx, `SELECT quantity_received::text,unit_cost::text FROM inventory_cost_layers WHERE merchant_id=$1 AND receipt_movement_id=$2`, account.Data.Merchant.ID, purchaseStockInBody.Data.ID).Scan(&purchaseLayerQuantity, &purchaseLayerCost); err != nil {
		t.Fatal(err)
	}
	if err = purchaseAssertTx.QueryRow(ctx, `SELECT count(*) FROM goods_receipts WHERE merchant_id=$1 AND purchase_order_id=$2`, account.Data.Merchant.ID, purchaseOrderID).Scan(&goodsReceiptCount); err != nil {
		t.Fatal(err)
	}
	if purchaseStatus != "RECEIVED" || purchaseReceived != "2.000000" || purchaseBalance != "7.000000" || purchaseLayerQuantity != "2.000000" || purchaseLayerCost != "12.34" || goodsReceiptCount != 1 {
		t.Fatalf("unexpected purchase receipt ledger: status=%s received=%s balance=%s layer_quantity=%s layer_cost=%s receipts=%d", purchaseStatus, purchaseReceived, purchaseBalance, purchaseLayerQuantity, purchaseLayerCost, goodsReceiptCount)
	}
	if err = purchaseAssertTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	disposableShop := requestJSON(t, app, http.MethodPost, "/api/v1/shops", map[string]any{
		"name": "Disposable Integration Shop", "code": "DELETE-" + uuid.NewString()[:8],
	}, managerSession.Data.AccessToken)
	if disposableShop.StatusCode != http.StatusCreated {
		t.Fatalf("disposable shop creation status = %d, body = %s", disposableShop.StatusCode, responseBody(disposableShop))
	}
	var disposableShopBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, disposableShop, &disposableShopBody)
	shopDelete := requestJSON(t, app, http.MethodDelete, "/api/v1/shops/"+disposableShopBody.Data.ID, nil, managerSession.Data.AccessToken)
	if shopDelete.StatusCode != http.StatusNoContent {
		t.Fatalf("shop delete status = %d, body = %s", shopDelete.StatusCode, responseBody(shopDelete))
	}
	terminalCreate := requestJSON(t, app, http.MethodPost, "/api/v1/pos/terminals", map[string]any{
		"shop_id": shopBody.Data.ID, "name": "Register 1", "device_identifier": "integration-device",
	}, managerSession.Data.AccessToken)
	if terminalCreate.StatusCode != http.StatusCreated {
		t.Fatalf("POS terminal creation status = %d, body = %s", terminalCreate.StatusCode, responseBody(terminalCreate))
	}
	var terminalBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeResponse(t, terminalCreate, &terminalBody)
	sessionCreate := requestJSON(t, app, http.MethodPost, "/api/v1/pos/sessions", map[string]any{
		"shop_id": shopBody.Data.ID, "terminal_id": terminalBody.Data.ID, "membership_id": managerSession.Data.User.MembershipID, "opening_cash": "100.00",
	}, managerSession.Data.AccessToken)
	if sessionCreate.StatusCode != http.StatusCreated {
		t.Fatalf("POS session creation status = %d, body = %s", sessionCreate.StatusCode, responseBody(sessionCreate))
	}
	forbidden := requestJSON(t, app, http.MethodPost, "/api/v1/admin/merchants", map[string]any{"name": "Denied"}, managerSession.Data.AccessToken)
	if forbidden.StatusCode != http.StatusForbidden {
		t.Fatalf("manager admin-operation status = %d, body = %s", forbidden.StatusCode, responseBody(forbidden))
	}
}

type seededUserAPIData struct{ merchantID, identityID, membershipID, roleID, email, password string }

func seedUserAPIData(ctx context.Context, pool *pgxpool.Pool) (seededUserAPIData, error) {
	seed := seededUserAPIData{email: "admin-" + uuid.NewString() + "@example.test", password: "Admin-user-password-123"}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return seed, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SET LOCAL row_security = off`); err != nil {
		return seed, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO currencies(code, name, decimal_places) VALUES ('TST', 'Test Currency', 2) ON CONFLICT (code) DO NOTHING`); err != nil {
		return seed, err
	}
	merchantSlug := "api-test-" + uuid.NewString()
	if err := tx.QueryRow(ctx, `INSERT INTO merchants(name, slug, default_currency_code) VALUES ('API Test Merchant', $1, 'TST') RETURNING id`, merchantSlug).Scan(&seed.merchantID); err != nil {
		return seed, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(seed.password), 10)
	if err != nil {
		return seed, err
	}
	if err := tx.QueryRow(ctx, `INSERT INTO user_identities(email, password_hash) VALUES ($1, $2) RETURNING id`, seed.email, string(hash)).Scan(&seed.identityID); err != nil {
		return seed, err
	}
	if err := tx.QueryRow(ctx, `INSERT INTO user_memberships(merchant_id, identity_id, display_name) VALUES ($1, $2, 'API Test Admin') RETURNING id`, seed.merchantID, seed.identityID).Scan(&seed.membershipID); err != nil {
		return seed, err
	}
	if err := tx.QueryRow(ctx, `INSERT INTO roles(merchant_id, code, name, is_system) VALUES ($1, 'admin', 'Administrator', true) RETURNING id`, seed.merchantID).Scan(&seed.roleID); err != nil {
		return seed, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO membership_roles(merchant_id, membership_id, role_id) VALUES ($1, $2, $3)`, seed.merchantID, seed.membershipID, seed.roleID); err != nil {
		return seed, err
	}
	if err := tx.Commit(ctx); err != nil {
		return seed, err
	}
	return seed, nil
}

func cleanupUserAPIData(ctx context.Context, pool *pgxpool.Pool, seed seededUserAPIData) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SET LOCAL row_security = off`); err != nil {
		return
	}
	_, _ = tx.Exec(ctx, `DELETE FROM merchants WHERE id = $1`, seed.merchantID)
	_, _ = tx.Exec(ctx, `DELETE FROM user_identities WHERE id = $1`, seed.identityID)
	_, _ = tx.Exec(ctx, `DELETE FROM user_identities WHERE email LIKE 'created-%@example.test'`)
	_ = tx.Commit(ctx)
}

func requestJSON(t *testing.T, app *fiber.App, method, path string, body any, token string) *http.Response {
	return requestJSONWithHeaders(t, app, method, path, body, token, nil)
}

func requestJSONWithHeaders(t *testing.T, app *fiber.App, method, path string, body any, token string, headers map[string]string) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	response, err := app.Test(req, fiber.TestConfig{Timeout: 20 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func decodeResponse(t *testing.T, response *http.Response, destination any) {
	t.Helper()
	defer response.Body.Close()
	if err := json.NewDecoder(response.Body).Decode(destination); err != nil {
		t.Fatal(err)
	}
}

func responseBody(response *http.Response) string {
	if response == nil || response.Body == nil {
		return ""
	}
	body, _ := io.ReadAll(response.Body)
	return string(body)
}
