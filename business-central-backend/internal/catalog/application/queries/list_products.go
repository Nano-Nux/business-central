package queries

import authdto "business-central-backend/internal/auth/application/dto"

type ListProducts struct{ Actor *authdto.Claims }
