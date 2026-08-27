package main

import (
	"context"
	"log"
	"time"

	httpadapter "business-central-backend/internal/adapters/inbound/http"
	authpostgres "business-central-backend/internal/auth/adapters/outbound/postgres"
	authapp "business-central-backend/internal/auth/application"
	catalogpostgres "business-central-backend/internal/catalog/adapters/outbound/postgres"
	catalogseaweedfs "business-central-backend/internal/catalog/adapters/outbound/seaweedfs"
	catalogapp "business-central-backend/internal/catalog/application"
	"business-central-backend/internal/config"
	"business-central-backend/internal/database"
	"business-central-backend/internal/media"
	operationspostgres "business-central-backend/internal/operations/adapters/outbound/postgres"
	operationsapp "business-central-backend/internal/operations/application"
	pospostgres "business-central-backend/internal/pos/adapters/outbound/postgres"
	posapp "business-central-backend/internal/pos/application"
	reportspostgres "business-central-backend/internal/reports/adapters/outbound/postgres"
	reportsapp "business-central-backend/internal/reports/application"
	servicespostgres "business-central-backend/internal/services/adapters/outbound/postgres"
	servicesapp "business-central-backend/internal/services/application"
	synchronizationpostgres "business-central-backend/internal/synchronization/adapters/outbound/postgres"
	synchronizationapp "business-central-backend/internal/synchronization/application"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if cfg.AutoInitSchema {
		exists, schemaErr := database.HasCoreSchema(ctx, pool)
		if schemaErr != nil {
			log.Fatal(schemaErr)
		}
		if !exists {
			if err := database.ApplySchema(ctx, pool, "schema.sql"); err != nil {
				log.Fatal(err)
			}
		}
	}
	if cfg.AutoMigrate {
		if err := database.Migrate(ctx, pool); err != nil {
			log.Fatal(err)
		}
	}

	authService := authpostgres.NewRepository(pool, cfg.JWTSecret, cfg.AccessTokenTTL, cfg.RefreshTokenTTL, cfg.PasswordCost)
	if cfg.AdminEmail != "" {
		created, err := authService.BootstrapDefaultAdmin(ctx, cfg.AdminEmail, cfg.AdminPassword)
		if err != nil {
			log.Fatal(err)
		}
		if created {
			log.Printf("default platform admin created for %s", cfg.AdminEmail)
		} else {
			log.Printf("default platform admin bootstrap skipped; an existing user was found")
		}
	} else if cfg.PlatformAdminEmail != "" {
		if err := authService.BootstrapPlatformAdmin(ctx, cfg.PlatformAdminEmail, cfg.PlatformAdminPassword); err != nil {
			log.Fatal(err)
		}
		log.Printf("platform admin bootstrap ready for %s", cfg.PlatformAdminEmail)
	}
	imageStorage := catalogseaweedfs.New(cfg.SeaweedFSFilerURL)
	api := httpadapter.New(pool, httpadapter.Dependencies{
		Authentication:  authapp.NewService(authService),
		Catalog:         catalogapp.NewService(catalogpostgres.NewRepository(pool), imageStorage),
		Media:           media.NewService(imageStorage),
		POS:             posapp.NewService(pospostgres.NewRepository(pool)),
		Operations:      operationsapp.NewService(operationspostgres.NewRepository(pool)),
		Reports:         reportsapp.NewService(reportspostgres.NewRepository(pool)),
		Services:        servicesapp.NewService(servicespostgres.NewRepository(pool)),
		Synchronization: synchronizationapp.NewService(synchronizationpostgres.NewRepository(pool)),
		CORSOrigin:      cfg.CORSOrigin,
	})
	baseURL := cfg.PublicBaseURL
	log.Printf("backend URL: %s", baseURL)
	log.Printf("swagger URL: %s/swagger/", baseURL)
	log.Printf("API health check: %s/health", baseURL)
	log.Printf("database health check: %s/health/db", baseURL)
	log.Printf("business-central-backend listening on %s:%s", cfg.Host, cfg.Port)
	if err := api.App().Listen(cfg.Host + ":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
