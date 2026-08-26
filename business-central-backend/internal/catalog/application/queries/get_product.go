package queries

import authdto "business-central-backend/internal/auth/application/dto"

type GetProduct struct {
	Actor     *authdto.Claims
	ProductID string
}
