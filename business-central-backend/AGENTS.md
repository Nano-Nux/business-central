# Backend Agent Instructions

- Use Go Fiber for HTTP delivery.
- Keep domain rules in domain/application layers; handlers should translate requests and responses.
- Treat `schema.sql` and the root `ERD.md`/`ARCHITECTURE.md` as authoritative design references.
- Preserve merchant tenant isolation, role/permission enforcement, module enablement, idempotency, and auditability.
- API changes must be coordinated with portal and mobile clients.
- Changes affecting mobile data must include SQLite schema and synchronization considerations.
- Run `go test ./...` before finishing when backend code exists.
