INSERT INTO permissions(code, description) VALUES
    ('stock_in', 'Perform stock-in and inventory receipt')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_code)
SELECT r.id, 'stock_in'
FROM roles r
WHERE r.code IN ('merchant', 'owner')
ON CONFLICT (role_id, permission_code) DO NOTHING;

CREATE OR REPLACE FUNCTION app_has_permission(p_permission_code VARCHAR) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT app_is_platform_admin()
        OR EXISTS (
            SELECT 1
              FROM user_memberships um
              JOIN membership_roles mr
                ON mr.merchant_id = um.merchant_id
               AND mr.membership_id = um.id
              JOIN roles r
                ON r.merchant_id = mr.merchant_id
               AND r.id = mr.role_id
              LEFT JOIN role_permissions rp
                ON rp.role_id = r.id
             WHERE um.merchant_id = app_current_merchant_id()
               AND um.identity_id = app_current_user_id()
               AND um.is_active
               AND (mr.valid_until IS NULL OR mr.valid_until >= now())
               AND (
                   rp.permission_code = p_permission_code
                   OR (p_permission_code IN ('tenant.read','tenant.write','rbac.manage','membership.manage','stock_in') AND r.code IN ('admin','merchant'))
               )
        );
$$;
