# Environments

The environment model is defined before deployment. The current production
procedure is implemented in [`deploy/README.md`](deploy/README.md).

## Required environments

| Environment | Purpose | Data policy |
|---|---|---|
| Local | Individual development and tests | Disposable seed data only |
| Development | Shared integration work | Non-production data |
| Staging | Release candidate validation | Sanitized or synthetic data |
| Production | Real merchant operations | Protected, backed up, audited data |

## Configuration categories

- Database connection
- API host and port
- Authentication and token secrets
- Allowed web origins
- Storage provider and secret references
- Payment provider configuration
- Logging and telemetry
- Feature/module defaults
- Mobile API base URL and environment label
- Mobile runtime mode: `ONLINE` or `FULLY_OFFLINE`

Never commit credentials, tokens, passwords, or provider secrets. Use secret references and environment-specific configuration.

## Environment parity

Schema version, API version, mobile sync protocol version, and enabled feature flags must be observable and documented for each environment.

## Mobile runtime modes

`ONLINE` mode is the normal connected product. It may temporarily use local SQLite when connectivity is unavailable and synchronizes later.

`FULLY_OFFLINE` mode is selected in the mobile `.env` configuration. It requires no internet connection and must have no backend client connection, synchronization worker, authentication refresh, upload, or background network request. It is a separate operating mode, not a temporary network state.

Mobile configuration uses `APPLICATION_NETWORK_ENVIRONMENT`,
`APPLICATION_ENVIRONMENT`, and `APPLICATION_BACKEND_URL`. Mode values are
case-insensitive; `ONLINE` is the connected mode and `OFFLINE`/
`FULLY_OFFLINE` resolve to the permanent local-only mode. Missing or invalid
mode values fail closed. Production ONLINE URLs must use HTTPS. For local
development, Android emulators reach the host computer through `10.0.2.2`,
while physical devices should use a LAN address or HTTPS endpoint.
