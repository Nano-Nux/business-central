package queries

import authdto "business-central-backend/internal/auth/application/dto"

type GetUser struct {
	Actor        *authdto.Claims
	MembershipID string
}
