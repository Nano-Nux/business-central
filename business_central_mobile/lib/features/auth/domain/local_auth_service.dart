import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';
import '../../../core/security/password_hasher.dart';

class LocalAuthException implements Exception {
  const LocalAuthException(this.message);
  final String message;
  @override
  String toString() => 'LocalAuthException: $message';
}

class LocalOwnerSetupResult {
  const LocalOwnerSetupResult({
    required this.merchantId,
    required this.shopId,
    required this.membershipId,
  });
  final String merchantId;
  final String shopId;
  final String membershipId;
}

class LocalLoginResult {
  const LocalLoginResult({
    required this.merchantId,
    required this.shopId,
    required this.membershipId,
    required this.identityId,
  });
  final String merchantId;
  final String shopId;
  final String membershipId;
  final String identityId;
}

class LocalAuthorizationSnapshot {
  const LocalAuthorizationSnapshot({
    required this.permissions,
    required this.modules,
  });
  final Set<String> permissions;
  final Set<String> modules;
}

class LocalAuthService {
  LocalAuthService({required this.database, PasswordHasher? passwordHasher})
    : _passwordHasher = passwordHasher ?? PasswordHasher();

  final AppDatabase database;
  AppDatabase get _database => database;
  final PasswordHasher _passwordHasher;
  static const _uuid = Uuid();

  Future<bool> isProvisioned() async {
    final row =
        await (_database.select(_database.appMetadata)
              ..where((entry) => entry.key.equals('owner_setup_completed')))
            .getSingleOrNull();
    return row?.value == 'true';
  }

  Future<LocalOwnerSetupResult> provisionOwner({
    required String email,
    required String password,
    String merchantName = 'My Merchant',
    String shopName = 'Main Shop',
    String currencyCode = 'USD',
    String deviceIdentifier = 'local-device',
  }) async {
    final normalizedEmail = _normalizeEmail(email);
    if (await isProvisioned()) {
      throw const LocalAuthException(
        'Local owner setup has already been completed.',
      );
    }
    final passwordHash = await _passwordHasher.hash(password);
    final merchantId = _uuid.v4();
    final shopId = _uuid.v4();
    final locationId = _uuid.v4();
    final identityId = _uuid.v4();
    final membershipId = _uuid.v4();
    final roleId = _uuid.v4();
    final deviceId = _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();

    await _database.transaction(() async {
      await _database
          .into(_database.merchants)
          .insert(
            MerchantsCompanion.insert(
              id: merchantId,
              name: merchantName.trim().isEmpty
                  ? 'My Merchant'
                  : merchantName.trim(),
              slug: 'local-$merchantId',
              currencyCode: currencyCode,
              createdAt: now,
            ),
          );
      await _database
          .into(_database.shops)
          .insert(
            ShopsCompanion.insert(
              id: shopId,
              merchantId: merchantId,
              name: shopName.trim().isEmpty ? 'Main Shop' : shopName.trim(),
              code: 'MAIN',
              createdAt: now,
            ),
          );
      await _database
          .into(_database.locations)
          .insert(
            LocationsCompanion.insert(
              id: locationId,
              merchantId: merchantId,
              shopId: Value(shopId),
              code: 'MAIN-STOCK',
              name: 'Main stock',
              locationType: 'SHOP',
              createdAt: now,
            ),
          );
      await _database
          .into(_database.userIdentities)
          .insert(
            UserIdentitiesCompanion.insert(
              id: identityId,
              email: normalizedEmail,
              passwordHash: passwordHash.hash,
              passwordSalt: passwordHash.salt,
              createdAt: now,
            ),
          );
      await _database
          .into(_database.userMemberships)
          .insert(
            UserMembershipsCompanion.insert(
              id: membershipId,
              merchantId: merchantId,
              identityId: identityId,
              displayName: normalizedEmail,
              shopId: Value(shopId),
              createdAt: now,
            ),
          );
      await _database
          .into(_database.roles)
          .insert(
            RolesCompanion.insert(
              id: roleId,
              merchantId: merchantId,
              code: 'merchant',
              name: 'Merchant',
              isSystem: const Value(true),
            ),
          );
      for (final permission in const [
        ('tenant.read', 'Read tenant-owned business data'),
        ('tenant.write', 'Write tenant-owned business data'),
        ('rbac.manage', 'Manage roles and permissions'),
        ('membership.manage', 'Manage tenant memberships'),
      ]) {
        await _database
            .into(_database.permissions)
            .insertOnConflictUpdate(
              PermissionsCompanion.insert(
                code: permission.$1,
                description: Value(permission.$2),
              ),
            );
        await _database
            .into(_database.rolePermissions)
            .insert(
              RolePermissionsCompanion.insert(
                roleId: roleId,
                permissionCode: permission.$1,
              ),
            );
      }
      await _database
          .into(_database.membershipRoles)
          .insert(
            MembershipRolesCompanion.insert(
              merchantId: merchantId,
              membershipId: membershipId,
              roleId: roleId,
              grantedAt: now,
            ),
          );
      for (final module in const [
        ('CORE', 'Core'),
        ('POS', 'Point of sale'),
        ('INVENTORY', 'Inventory'),
        ('SERVICES', 'Services'),
        ('REPAIR', 'Repair'),
      ]) {
        await _database
            .into(_database.modules)
            .insertOnConflictUpdate(
              ModulesCompanion.insert(code: module.$1, name: module.$2),
            );
        await _database
            .into(_database.merchantModules)
            .insert(
              MerchantModulesCompanion.insert(
                merchantId: merchantId,
                moduleCode: module.$1,
                status: 'ENABLED',
                enabledAt: now,
              ),
            );
        await _database
            .into(_database.shopModules)
            .insert(
              ShopModulesCompanion.insert(
                merchantId: merchantId,
                shopId: shopId,
                moduleCode: module.$1,
              ),
            );
      }
      await _database
          .into(_database.merchantSettings)
          .insert(
            MerchantSettingsCompanion.insert(
              id: _uuid.v4(),
              merchantId: merchantId,
              shopId: Value(shopId),
              settingKey: 'receipt.footer_note',
              valueType: 'STRING',
              valueJson: '""',
              updatedAt: now,
            ),
          );
      await _database
          .into(_database.syncDevices)
          .insert(
            SyncDevicesCompanion.insert(
              id: deviceId,
              merchantId: merchantId,
              membershipId: Value(membershipId),
              deviceIdentifier: deviceIdentifier,
            ),
          );
      await _database
          .into(_database.appMetadata)
          .insertOnConflictUpdate(
            AppMetadataCompanion.insert(
              key: 'owner_setup_completed',
              value: 'true',
              updatedAt: now,
            ),
          );
      await LocalAuditRepository(
        database: _database,
        merchantId: merchantId,
        actorMembershipId: membershipId,
      ).record(
        action: 'CREATE',
        entityType: 'merchant',
        entityId: merchantId,
        shopId: shopId,
        afterData: {
          'name': merchantName.trim().isEmpty
              ? 'My Merchant'
              : merchantName.trim(),
          'shop_id': shopId,
          'owner_membership_id': membershipId,
        },
      );
    });

    return LocalOwnerSetupResult(
      merchantId: merchantId,
      shopId: shopId,
      membershipId: membershipId,
    );
  }

  Future<LocalLoginResult> login({
    required String email,
    required String password,
  }) async {
    final normalizedEmail = _normalizeEmail(email);
    final identity =
        await (_database.select(_database.userIdentities)..where(
              (row) =>
                  row.email.equals(normalizedEmail) & row.isActive.equals(true),
            ))
            .getSingleOrNull();
    if (identity == null) {
      throw const LocalAuthException('Invalid email or password.');
    }
    final valid = await _passwordHasher.verify(
      password: password,
      stored: PasswordHash(
        hash: identity.passwordHash,
        salt: identity.passwordSalt,
      ),
    );
    if (!valid) throw const LocalAuthException('Invalid email or password.');
    final membership =
        await (_database.select(_database.userMemberships)..where(
              (row) =>
                  row.identityId.equals(identity.id) &
                  row.isActive.equals(true),
            ))
            .getSingleOrNull();
    if (membership == null || membership.shopId == null) {
      throw const LocalAuthException(
        'Active merchant membership and shop are required.',
      );
    }
    final now = DateTime.now().toUtc().toIso8601String();
    await _database.transaction(() async {
      await (_database.update(_database.userIdentities)
            ..where((row) => row.id.equals(identity.id)))
          .write(UserIdentitiesCompanion(lastLoginAt: Value(now)));
      await LocalAuditRepository(
        database: _database,
        merchantId: membership.merchantId,
        actorMembershipId: membership.id,
      ).record(
        action: 'LOGIN',
        entityType: 'user_identity',
        entityId: identity.id,
        shopId: membership.shopId,
        afterData: {'membership_id': membership.id},
      );
    });
    return LocalLoginResult(
      merchantId: membership.merchantId,
      shopId: membership.shopId!,
      membershipId: membership.id,
      identityId: identity.id,
    );
  }

  Future<LocalAuthorizationSnapshot> authorizationFor({
    required String merchantId,
    required String membershipId,
  }) async {
    final membership =
        await (_database.select(_database.userMemberships)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.id.equals(membershipId) &
                  row.isActive.equals(true),
            ))
            .getSingleOrNull();
    if (membership == null) {
      throw const LocalAuthException('Active merchant membership is required.');
    }
    final assignments =
        await (_database.select(_database.membershipRoles)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.membershipId.equals(membershipId),
            ))
            .get();
    final roleIds = assignments.map((row) => row.roleId).toSet();
    final roles =
        await (_database.select(_database.roles)..where(
              (row) => row.merchantId.equals(merchantId) & row.id.isIn(roleIds),
            ))
            .get();
    final permissions = <String>{};
    for (final role in roles) {
      final rows = await (_database.select(
        _database.rolePermissions,
      )..where((row) => row.roleId.equals(role.id))).get();
      permissions.addAll(rows.map((row) => row.permissionCode));
    }
    final merchantModules =
        await (_database.select(_database.merchantModules)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.status.equals('ENABLED'),
            ))
            .get();
    final shopModules = membership.shopId == null
        ? const <ShopModule>[]
        : await (_database.select(_database.shopModules)..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.shopId.equals(membership.shopId!),
              ))
              .get();
    final enabledShopModules = shopModules.map((row) => row.moduleCode).toSet();
    return LocalAuthorizationSnapshot(
      permissions: permissions,
      modules: merchantModules
          .where((row) => enabledShopModules.contains(row.moduleCode))
          .map((row) => row.moduleCode)
          .toSet(),
    );
  }

  String _normalizeEmail(String value) {
    final normalized = value.trim().toLowerCase();
    final valid = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(normalized);
    if (!valid) throw const LocalAuthException('Enter a valid email address.');
    return normalized;
  }
}
