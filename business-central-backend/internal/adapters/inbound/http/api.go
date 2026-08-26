package http

import (
	"context"
	"errors"
	"log"
	"path/filepath"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authhttp "business-central-backend/internal/auth/adapters/inbound/http"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	cataloghttp "business-central-backend/internal/catalog/adapters/inbound/http"
	cataloginbound "business-central-backend/internal/catalog/ports/inbound"
	"business-central-backend/internal/media"
	mediahttp "business-central-backend/internal/media/adapters/inbound/http"
	operationshttp "business-central-backend/internal/operations/adapters/inbound/http"
	operationsinbound "business-central-backend/internal/operations/ports/inbound"
	poshttp "business-central-backend/internal/pos/adapters/inbound/http"
	posinbound "business-central-backend/internal/pos/ports/inbound"
	reportshttp "business-central-backend/internal/reports/adapters/inbound/http"
	reportsinbound "business-central-backend/internal/reports/ports/inbound"
	serviceshttp "business-central-backend/internal/services/adapters/inbound/http"
	servicesinbound "business-central-backend/internal/services/ports/inbound"
	synchronizationhttp "business-central-backend/internal/synchronization/adapters/inbound/http"
	synchronizationinbound "business-central-backend/internal/synchronization/ports/inbound"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/static"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type API struct {
	app             *fiber.App
	db              *pgxpool.Pool
	auth            *authhttp.Handler
	catalog         *cataloghttp.Handler
	media           *mediahttp.Handler
	pos             *poshttp.Handler
	operations      *operationshttp.Handler
	reports         *reportshttp.Handler
	services        *serviceshttp.Handler
	synchronization *synchronizationhttp.Handler
}

type Dependencies struct {
	Authentication  authinbound.Authentication
	Catalog         cataloginbound.Catalog
	Media           *media.Service
	POS             posinbound.POS
	Operations      operationsinbound.Operations
	Reports         reportsinbound.Reports
	Services        servicesinbound.Services
	Synchronization synchronizationinbound.Synchronization
	CORSOrigin      string
}

func New(db *pgxpool.Pool, dependencies Dependencies) *API {
	return NewWithDocs(db, dependencies, "docs")
}

func NewWithDocs(db *pgxpool.Pool, dependencies Dependencies, docsRoot string) *API {
	api := &API{
		db:              db,
		auth:            authhttp.NewHandler(dependencies.Authentication),
		catalog:         cataloghttp.NewHandler(dependencies.Catalog, dependencies.Authentication),
		media:           mediahttp.NewHandler(dependencies.Media, dependencies.Authentication),
		pos:             poshttp.NewHandler(dependencies.POS, dependencies.Authentication),
		operations:      operationshttp.NewHandler(dependencies.Operations, dependencies.Authentication),
		reports:         reportshttp.NewHandler(dependencies.Reports),
		services:        serviceshttp.NewHandler(dependencies.Services, dependencies.Authentication),
		synchronization: synchronizationhttp.NewHandler(dependencies.Synchronization, dependencies.Authentication),
	}
	// Resource validators enforce the 500 KB image limit. The wider transport limit
	// also accommodates synchronization and legacy repair JSON payloads.
	api.app = fiber.New(fiber.Config{ErrorHandler: api.errorHandler, BodyLimit: 11 << 20})
	origin := dependencies.CORSOrigin
	if strings.TrimSpace(origin) == "" {
		origin = "*"
	}
	api.app.Use(cors.New(cors.Config{
		AllowOrigins: strings.Split(origin, ","),
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Merchant-ID", "X-Request-ID", "Idempotency-Key"},
	}))
	api.app.Use(api.requestID)
	api.app.Use(logger.New(logger.Config{
		Format:        "[${time}] ${status} ${method} ${path} ${latency} ${error}\n",
		TimeZone:      "UTC",
		DisableColors: true,
	}))
	swaggerIndex := func(c fiber.Ctx) error { return c.SendFile(filepath.Join(docsRoot, "index.html")) }
	api.app.Get("/swagger", swaggerIndex)
	api.app.Get("/swagger/", swaggerIndex)
	api.app.Use("/swagger", static.New(docsRoot))
	api.app.Get("/health", api.health)
	api.app.Get("/health/db", api.healthDB)

	v1 := api.app.Group("/api/v1")
	api.auth.RegisterPublicRoutes(v1)

	protected := v1.Group("", api.authenticate)
	api.auth.RegisterProtectedRoutes(protected)
	api.catalog.RegisterRoutes(protected)
	api.media.RegisterRoutes(protected)
	api.pos.RegisterRoutes(protected)
	api.operations.RegisterRoutes(protected)
	api.reports.RegisterRoutes(protected)
	api.services.RegisterRoutes(protected)
	api.synchronization.RegisterRoutes(protected)
	return api
}

func (api *API) App() *fiber.App { return api.app }

func (api *API) requestID(c fiber.Ctx) error {
	requestID := c.Get("X-Request-ID")
	if _, err := uuid.Parse(requestID); err != nil {
		requestID = uuid.NewString()
	}
	c.Locals("request_id", requestID)
	c.Set("X-Request-ID", requestID)
	return c.Next()
}

func (api *API) authenticate(c fiber.Ctx) error {
	parts := strings.Fields(c.Get("Authorization"))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return app.NewError("UNAUTHENTICATED", "Authentication is required.", 401)
	}
	claims, authErr := api.auth.ParseAccessToken(parts[1])
	if authErr != nil {
		return authErr
	}
	if err := api.auth.ValidateSession(c.Context(), claims); err != nil {
		if apiErr, ok := err.(*app.Error); ok {
			return apiErr
		}
		return app.Internal(err)
	}
	if claims.PlatformAdmin {
		merchantID := c.Get("X-Merchant-ID")
		if _, err := uuid.Parse(merchantID); err == nil {
			copy := *claims
			copy.MerchantID = merchantID
			claims = &copy
		}
	}
	c.Locals("claims", claims)
	return c.Next()
}

func (api *API) claims(c fiber.Ctx) *authdto.Claims {
	claims, _ := c.Locals("claims").(*authdto.Claims)
	return claims
}

func (api *API) requirePermission(c fiber.Ctx, permission string) error {
	allowed, err := api.auth.HasPermission(c.Context(), api.claims(c), permission)
	if err != nil {
		return app.Internal(err)
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "You do not have permission to perform this action.", 403)
	}
	return nil
}

func (api *API) requirePlatformAdmin(c fiber.Ctx) error {
	if !api.claims(c).PlatformAdmin {
		return app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	return nil
}

func (api *API) health(c fiber.Ctx) error {
	return c.JSON(map[string]any{"status": "ok", "service": "business-central-backend", "timestamp": time.Now().UTC()})
}

func (api *API) healthDB(c fiber.Ctx) error {
	if err := api.db.Ping(c.Context()); err != nil {
		return &app.Error{Code: "INTERNAL_ERROR", Message: "Database health check failed.", Status: 503, Internal: err}
	}
	return c.JSON(map[string]any{"status": "ok", "database": "ok", "timestamp": time.Now().UTC()})
}

func (api *API) errorHandler(c fiber.Ctx, err error) error {
	status := 500
	response := map[string]any{"error": map[string]any{"code": "INTERNAL_ERROR", "message": "An unexpected server error occurred."}, "request_id": c.Locals("request_id")}
	var apiErr *app.Error
	var fiberErr *fiber.Error
	if errors.As(err, &apiErr) {
		status = apiErr.Status
		body := map[string]any{"code": apiErr.Code, "message": apiErr.Message}
		if apiErr.Fields != nil {
			body["fields"] = apiErr.Fields
		}
		response["error"] = body
	} else if errors.As(err, &fiberErr) {
		status = fiberErr.Code
		response["error"] = map[string]any{"code": "HTTP_ERROR", "message": fiberErr.Message}
	}
	log.Printf("http error request_id=%v method=%s path=%s status=%d error=%v", c.Locals("request_id"), c.Method(), c.Path(), status, err)
	return c.Status(status).JSON(response)
}

func noRows(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return app.NewError("NOT_FOUND", "User not found.", 404)
	}
	return app.Internal(err)
}

func contextWithTimeout(c fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Context(), 10*time.Second)
}
