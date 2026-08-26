-- Applied by the backend migration runner. The executable SQL is embedded in
-- internal/database/migrations.go so the binary can migrate a remote database
-- without depending on the process working directory.
--
-- This migration expands identity and membership reads for authorized
-- membership managers while retaining merchant-scoped RLS predicates.

-- Platform-admin support is applied by migration 0002_platform_admin_support.
