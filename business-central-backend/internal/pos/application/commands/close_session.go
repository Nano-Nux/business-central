package commands

import authdto "business-central-backend/internal/auth/application/dto"

type CloseSession struct {
	Actor     *authdto.Claims
	SessionID string
}
