package commands

import (
	authdto "business-central-backend/internal/auth/application/dto"
)

type CreateUser struct {
	Actor   *authdto.Claims
	Request authdto.CreateUserRequest
}
