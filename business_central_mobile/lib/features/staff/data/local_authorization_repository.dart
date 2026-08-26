import 'package:drift/drift.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';

class LocalRoleDefinition {
  const LocalRoleDefinition({
    required this.id,
    required this.code,
    required this.name,
    required this.isSystem,
    required this.permissionCodes,
  });

  final String id;
  final String code;
  final String name;
  final bool isSystem;
  final Set<String> permissionCodes;
}

class LocalPermissionDefinition {
  const LocalPermissionDefinition({required this.code, this.description});

  final String code;
  final String? description;
}

class LocalModuleAccess {
  const LocalModuleAccess({
    required this.code,
    required this.name,
    required this.merchantEnabled,
    required this.shopEnabled,
  });

  final String code;
  final String name;
  final bool merchantEnabled;
  final bool shopEnabled;
}

class LocalAuthorizationSnapshot {
  const LocalAuthorizationSnapshot({
    required this.roles,
    required this.permissions,
    required this.modules,
  });

  final List<LocalRoleDefinition> roles;
  final List<LocalPermissionDefinition> permissions;
  final List<LocalModuleAccess> modules;
}

/// Fully-offline owner authorization administration.
///
/// This repository only changes local role permission assignments and
/// shop-module enablement. It never queues or uploads authorization changes;
/// the ONLINE backend remains the authority for those operations.
class LocalAuthorizationRepository {
  LocalAuthorizationRepository({
    required this.database,
    required this.merchantId,
    required this.actorMembershipId,
  });

  final AppDatabase database;
  final String merchantId;
  final String actorMembershipId;

  Future<LocalAuthorizationSnapshot> snapshot({required String shopId}) async {
    await _requireShop(shopId);
    final roles = await (database.select(
      database.roles,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final roleIds = roles.map((role) => role.id).toSet();
    final permissionRows = await (database.select(
      database.rolePermissions,
    )..where((row) => row.roleId.isIn(roleIds))).get();
    final codesByRole = <String, Set<String>>{};
    for (final row in permissionRows) {
      (codesByRole[row.roleId] ??= <String>{}).add(row.permissionCode);
    }
    final permissionDefinitions = await database
        .select(database.permissions)
        .get();
    final merchantModules = await (database.select(
      database.merchantModules,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final merchantByCode = {
      for (final row in merchantModules) row.moduleCode: row,
    };
    final shopModules =
        await (database.select(database.shopModules)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.shopId.equals(shopId),
            ))
            .get();
    final shopCodes = shopModules.map((row) => row.moduleCode).toSet();
    final modules = await (database.select(
      database.modules,
    )..where((row) => row.isActive.equals(true))).get();
    return LocalAuthorizationSnapshot(
      roles: [
        for (final role in roles)
          LocalRoleDefinition(
            id: role.id,
            code: role.code,
            name: role.name,
            isSystem: role.isSystem,
            permissionCodes: codesByRole[role.id] ?? const <String>{},
          ),
      ],
      permissions: [
        for (final permission in permissionDefinitions)
          LocalPermissionDefinition(
            code: permission.code,
            description: permission.description,
          ),
      ],
      modules: [
        for (final module in modules)
          LocalModuleAccess(
            code: module.code,
            name: module.name,
            merchantEnabled: merchantByCode[module.code]?.status == 'ENABLED',
            shopEnabled: shopCodes.contains(module.code),
          ),
      ],
    );
  }

  Future<void> updateRolePermissions({
    required String roleId,
    required Set<String> permissionCodes,
  }) async {
    await _requireAdmin('rbac.manage');
    final role =
        await (database.select(database.roles)..where(
              (row) =>
                  row.id.equals(roleId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (role == null) throw StateError('Role is outside the active merchant.');
    if (role.isSystem && role.code == 'merchant') {
      throw const FormatException('The local owner role cannot be changed.');
    }
    final normalized = permissionCodes.map((code) => code.trim()).toSet()
      ..removeWhere((code) => code.isEmpty);
    final available = await (database.select(
      database.permissions,
    )..where((row) => row.code.isIn(normalized))).get();
    if (available.length != normalized.length) {
      throw const FormatException('A permission is not available locally.');
    }
    await database.transaction(() async {
      await (database.delete(
        database.rolePermissions,
      )..where((row) => row.roleId.equals(roleId))).go();
      for (final code in normalized) {
        await database
            .into(database.rolePermissions)
            .insert(
              RolePermissionsCompanion.insert(
                roleId: roleId,
                permissionCode: code,
              ),
            );
      }
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'UPDATE',
        entityType: 'role_permissions',
        entityId: roleId,
        afterData: {
          'role_code': role.code,
          'permission_codes': [...normalized]..sort(),
        },
      );
    });
  }

  Future<void> setShopModule({
    required String shopId,
    required String moduleCode,
    required bool enabled,
  }) async {
    await _requireAdmin('rbac.manage');
    await _requireShop(shopId);
    final module =
        await (database.select(database.modules)..where(
              (row) => row.code.equals(moduleCode) & row.isActive.equals(true),
            ))
            .getSingleOrNull();
    if (module == null) throw StateError('Module is not available locally.');
    final merchantModule =
        await (database.select(database.merchantModules)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.moduleCode.equals(moduleCode),
            ))
            .getSingleOrNull();
    if (merchantModule == null || merchantModule.status != 'ENABLED') {
      throw const FormatException('The merchant module is disabled.');
    }
    await database.transaction(() async {
      final query = database.delete(database.shopModules)
        ..where(
          (row) =>
              row.merchantId.equals(merchantId) &
              row.shopId.equals(shopId) &
              row.moduleCode.equals(moduleCode),
        );
      if (enabled) {
        await database
            .into(database.shopModules)
            .insertOnConflictUpdate(
              ShopModulesCompanion.insert(
                merchantId: merchantId,
                shopId: shopId,
                moduleCode: moduleCode,
              ),
            );
      } else {
        await query.go();
      }
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'UPDATE',
        entityType: 'shop_module',
        entityId: '$shopId:$moduleCode',
        shopId: shopId,
        afterData: {'module_code': moduleCode, 'enabled': enabled},
      );
    });
  }

  Future<void> _requireAdmin(String permissionCode) async {
    final membership =
        await (database.select(database.userMemberships)..where(
              (row) =>
                  row.id.equals(actorMembershipId) &
                  row.merchantId.equals(merchantId) &
                  row.isActive.equals(true),
            ))
            .getSingleOrNull();
    if (membership == null) throw StateError('Authorization actor is invalid.');
    final assignments =
        await (database.select(database.membershipRoles)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.membershipId.equals(actorMembershipId),
            ))
            .get();
    final roleIds = assignments.map((row) => row.roleId).toSet();
    final roles =
        await (database.select(database.roles)..where(
              (row) => row.merchantId.equals(merchantId) & row.id.isIn(roleIds),
            ))
            .get();
    if (roles.any((role) => role.code == 'merchant')) return;
    final granted =
        await (database.select(database.rolePermissions)..where(
              (row) =>
                  row.roleId.isIn(roleIds) &
                  row.permissionCode.equals(permissionCode),
            ))
            .get();
    if (granted.isEmpty) {
      throw StateError('Missing local permission: $permissionCode');
    }
  }

  Future<void> _requireShop(String shopId) async {
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null || !shop.isActive) {
      throw StateError('Shop is outside the active merchant.');
    }
  }
}
