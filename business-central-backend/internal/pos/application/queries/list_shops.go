package queries

import authdto "business-central-backend/internal/auth/application/dto"

type ListShops struct{ Actor *authdto.Claims }
