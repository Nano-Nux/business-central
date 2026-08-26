# Mobile backup and recovery

The fully offline database is the source of truth and must not be deleted or
recreated during upgrades. The current deliberate local backup service exports
and restores an authenticated merchant-scoped operational JSON payload with
schema validation, tenant-scope validation, merchant/shop settings, pending
operation rows, promotion definitions/scopes/codes, order promotion links,
exact order-line discount/tax fields, repair/payment/refund data, append-only
local audit records, and a deterministic SHA-256 checksum over the payload. A password-protected
Argon2id/AES-256-GCM envelope is also available for exports. Credentials,
authorization assignments, and Bluetooth pairing addresses are not exported.

The Settings screen provides password entry plus explicit clipboard export and
restore confirmation. Native file save/open dialogs and platform share-sheet
export are also available for the encrypted payload. Native SQLite files use a
secure-storage encryption key; pending operation rows are included in every
current encrypted export.

Restore must validate the backup format, checksum, schema compatibility, and
merchant identity before replacing the active database. The application must
show the selected backup and request explicit confirmation. Recovery must not
introduce a hidden default password; the owner must authenticate with the
restored credential or complete an approved recovery flow.
