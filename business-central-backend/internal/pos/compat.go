// Package pos preserves legacy DTO imports during the bounded-context migration.
package pos

import "business-central-backend/internal/pos/application/dto"

type Shop = dto.Shop
type Terminal = dto.Terminal
type Session = dto.Session
type ShopRequest = dto.ShopRequest
type TerminalRequest = dto.TerminalRequest
type SessionRequest = dto.SessionRequest
