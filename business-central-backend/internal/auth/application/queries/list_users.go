package queries

import authdto "business-central-backend/internal/auth/application/dto"

type ListUsers struct {
	Actor    *authdto.Claims
	Page     int
	PageSize int
}
