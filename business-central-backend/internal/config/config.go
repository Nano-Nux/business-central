package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL           string
	Host                  string
	Port                  string
	PublicBaseURL         string
	CORSOrigin            string
	SeaweedFSFilerURL     string
	JWTSecret             []byte
	AccessTokenTTL        time.Duration
	RefreshTokenTTL       time.Duration
	Environment           string
	AutoMigrate           bool
	AutoInitSchema        bool
	PasswordCost          int
	AdminEmail            string
	AdminPassword         string
	PlatformAdminEmail    string
	PlatformAdminPassword string
}

func Load() (Config, error) {
	loadDotEnvFile(".env")

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if len(secret) < 32 {
		return Config{}, errors.New("JWT_SECRET must be at least 32 characters")
	}
	platformAdminEmail := strings.ToLower(strings.TrimSpace(os.Getenv("PLATFORM_ADMIN_EMAIL")))
	platformAdminPassword := os.Getenv("PLATFORM_ADMIN_PASSWORD")
	if platformAdminEmail == "" && platformAdminPassword == "" {
		platformAdminEmail = strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL")))
		platformAdminPassword = os.Getenv("ADMIN_PASSWORD")
	}
	if (platformAdminEmail == "") != (platformAdminPassword == "") {
		return Config{}, errors.New("PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be provided together")
	}
	adminEmail := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL")))
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if (adminEmail == "") != (adminPassword == "") {
		return Config{}, errors.New("ADMIN_EMAIL and ADMIN_PASSWORD must be provided together")
	}

	accessTTL, err := durationEnv("ACCESS_TOKEN_TTL", 24*time.Hour)
	if err != nil {
		return Config{}, err
	}
	refreshTTL, err := durationEnv("REFRESH_TOKEN_TTL", 14*24*time.Hour)
	if err != nil {
		return Config{}, err
	}
	cost := intEnv("BCRYPT_COST", 12)
	if cost < 10 || cost > 15 {
		return Config{}, errors.New("BCRYPT_COST must be between 10 and 15")
	}

	port := envOr("PORT", "8080")
	environment := envOr("APP_ENV", "development")
	publicBaseURL := envOr("PUBLIC_BASE_URL", fmt.Sprintf("http://localhost:%s", port))
	corsOrigin := envOr("CORS_ORIGIN", "*")
	return Config{
		DatabaseURL:           databaseURL,
		Host:                  envOr("HOST", "0.0.0.0"),
		Port:                  port,
		PublicBaseURL:         strings.TrimRight(publicBaseURL, "/"),
		CORSOrigin:            corsOrigin,
		SeaweedFSFilerURL:     envOr("SEAWEEDFS_FILER_URL", "http://localhost:8888"),
		JWTSecret:             []byte(secret),
		AccessTokenTTL:        accessTTL,
		RefreshTokenTTL:       refreshTTL,
		Environment:           environment,
		AutoMigrate:           boolEnv("AUTO_MIGRATE", true),
		AutoInitSchema:        boolEnv("AUTO_INIT_SCHEMA", false),
		PasswordCost:          cost,
		AdminEmail:            adminEmail,
		AdminPassword:         adminPassword,
		PlatformAdminEmail:    platformAdminEmail,
		PlatformAdminPassword: platformAdminPassword,
	}, nil
}

func loadDotEnvFile(path string) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(contents), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
		if key != "" {
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, value)
			}
		}
	}
}

func durationEnv(key string, fallback time.Duration) (time.Duration, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}
	duration, err := time.ParseDuration(value)
	if err != nil || duration <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration: %w", key, err)
	}
	return duration, nil
}

func intEnv(key string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(key))
	if err != nil {
		return fallback
	}
	return value
}

func boolEnv(key string, fallback bool) bool {
	value, err := strconv.ParseBool(os.Getenv(key))
	if err != nil {
		return fallback
	}
	return value
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
