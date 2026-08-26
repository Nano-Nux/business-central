package queries

import authdto "business-central-backend/internal/auth/application/dto"

type ListMovements struct{ Actor *authdto.Claims }
