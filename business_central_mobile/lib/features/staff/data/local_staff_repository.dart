import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';
import '../../../core/security/password_hasher.dart';
import '../../auth/data/online_auth_api.dart';
import '../application/staff_repository.dart';

/// FULLY_OFFLINE staff authority.
///
/// Staff identities, memberships, roles, and authorization assignments stay
/// inside the local tenant graph. This repository never creates a backend
/// client and does not enqueue authorization changes for ONLINE sync.
class LocalStaffRepository implements StaffRepository {
  LocalStaffRepository({
    required this.database,
    required this.merchantId,
    this.actorMembershipId,
    PasswordHasher? passwordHasher,
  }) : _passwordHasher = passwordHasher ?? PasswordHasher();

  final AppDatabase database;
  final String merchantId;
  final String? actorMembershipId;
  final PasswordHasher _passwordHasher;
  static const _uuid = Uuid();

  @override
  Future<List<OnlineUser>> listUsers() async {
    final memberships =
        await (database.select(database.userMemberships)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([(row) => OrderingTerm(expression: row.displayName)]))
            .get();
    final identities =
        await (database.select(database.userIdentities)..where(
              (row) =>
                  row.id.isIn(memberships.map((row) => row.identityId).toSet()),
            ))
            .get();
    final identitiesById = {for (final row in identities) row.id: row};
    final assignments = await (database.select(
      database.membershipRoles,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final roles = await (database.select(
      database.roles,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final rolesById = {for (final row in roles) row.id: row};
    final permissions = await (database.select(
      database.rolePermissions,
    )..where((row) => row.roleId.isIn(rolesById.keys))).get();
    final permissionsByRole = <String, List<String>>{};
    for (final permission in permissions) {
      (permissionsByRole[permission.roleId] ??= []).add(
        permission.permissionCode,
      );
    }
    return [
      for (final membership in memberships)
        if (identitiesById[membership.identityId] != null)
          OnlineUser(
            id: membership.identityId,
            membershipId: membership.id,
            merchantId: merchantId,
            email: identitiesById[membership.identityId]!.email,
            phone: identitiesById[membership.identityId]!.phone,
            displayName: membership.displayName,
            isActive:
                membership.isActive &&
                identitiesById[membership.identityId]!.isActive,
            roles: [
              for (final assignment in assignments)
                if (assignment.membershipId == membership.id &&
                    rolesById[assignment.roleId] != null)
                  OnlineRole(
                    code: rolesById[assignment.roleId]!.code,
                    permissionCodes:
                        permissionsByRole[assignment.roleId] ?? const [],
                  ),
            ],
            platformAdmin: false,
            shopId: membership.shopId,
          ),
    ];
  }

  @override
  Future<List<OnlineRole>> listRoles() async {
    final roles = await (database.select(
      database.roles,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final permissions =
        await (database.select(database.rolePermissions)..where(
              (row) => row.roleId.isIn(roles.map((role) => role.id).toSet()),
            ))
            .get();
    final permissionsByRole = <String, List<String>>{};
    for (final permission in permissions) {
      (permissionsByRole[permission.roleId] ??= []).add(
        permission.permissionCode,
      );
    }
    return [
      for (final role in roles)
        OnlineRole(
          code: role.code,
          permissionCodes: permissionsByRole[role.id] ?? const [],
        ),
    ];
  }

  @override
  Future<OnlineUser> create({
    required String email,
    required String password,
    required String displayName,
    String? phone,
    String? roleCode,
    String? shopId,
  }) async {
    final normalizedEmail = _email(email);
    final normalizedName = displayName.trim();
    if (normalizedName.isEmpty) {
      throw const FormatException('Display name is required.');
    }
    final normalizedShop = await _requireShop(shopId);
    final normalizedRole = _roleCode(roleCode);
    if (normalizedRole == 'merchant') {
      throw const FormatException(
        'The local owner role can only be created during owner setup.',
      );
    }
    final existing = await (database.select(
      database.userIdentities,
    )..where((row) => row.email.equals(normalizedEmail))).getSingleOrNull();
    if (existing != null) {
      throw const FormatException('An account with this email already exists.');
    }
    final hash = await _passwordHasher.hash(password);
    final identityId = _uuid.v4();
    final membershipId = _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();
    await database.transaction(() async {
      final role = await _ensureRole(normalizedRole, now);
      await database
          .into(database.userIdentities)
          .insert(
            UserIdentitiesCompanion.insert(
              id: identityId,
              email: normalizedEmail,
              phone: Value(_optional(phone)),
              passwordHash: hash.hash,
              passwordSalt: hash.salt,
              createdAt: now,
            ),
          );
      await database
          .into(database.userMemberships)
          .insert(
            UserMembershipsCompanion.insert(
              id: membershipId,
              merchantId: merchantId,
              identityId: identityId,
              displayName: normalizedName,
              shopId: Value(normalizedShop),
              createdAt: now,
            ),
          );
      await database
          .into(database.membershipRoles)
          .insert(
            MembershipRolesCompanion.insert(
              merchantId: merchantId,
              membershipId: membershipId,
              roleId: role.id,
              grantedAt: now,
            ),
          );
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'CREATE',
        entityType: 'user_membership',
        entityId: membershipId,
        shopId: normalizedShop,
        afterData: {
          'identity_id': identityId,
          'email': normalizedEmail,
          'display_name': normalizedName,
          'role_code': normalizedRole,
        },
      );
    });
    return (await listUsers()).firstWhere(
      (user) => user.membershipId == membershipId,
    );
  }

  @override
  Future<OnlineUser> update(
    String id, {
    String? displayName,
    String? phone,
    String? password,
    bool? isActive,
    String? roleId,
    String? shopId,
  }) async {
    final membership = await _membership(id);
    final identity = await (database.select(
      database.userIdentities,
    )..where((row) => row.id.equals(membership.identityId))).getSingle();
    final hash = password == null || password.isEmpty
        ? null
        : await _passwordHasher.hash(password);
    final normalizedShop = shopId == null ? null : await _requireShop(shopId);
    await database.transaction(() async {
      await (database.update(
        database.userMemberships,
      )..where((row) => row.id.equals(membership.id))).write(
        UserMembershipsCompanion(
          displayName: displayName == null
              ? const Value.absent()
              : Value(displayName.trim()),
          shopId: normalizedShop == null
              ? const Value.absent()
              : Value(normalizedShop),
          isActive: isActive == null ? const Value.absent() : Value(isActive),
        ),
      );
      await (database.update(
        database.userIdentities,
      )..where((row) => row.id.equals(identity.id))).write(
        UserIdentitiesCompanion(
          phone: phone == null ? const Value.absent() : Value(_optional(phone)),
          isActive: isActive == null ? const Value.absent() : Value(isActive),
          passwordHash: hash == null ? const Value.absent() : Value(hash.hash),
          passwordSalt: hash == null ? const Value.absent() : Value(hash.salt),
        ),
      );
      if (roleId != null && roleId.trim().isNotEmpty) {
        final role = await _findRole(roleId.trim());
        if (role == null) throw const FormatException('Role is not available.');
        if (role.code == 'merchant' && membership.id != actorMembershipId) {
          throw const FormatException(
            'The local owner role cannot be assigned to staff.',
          );
        }
        await (database.delete(database.membershipRoles)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.membershipId.equals(membership.id),
            ))
            .go();
        await database
            .into(database.membershipRoles)
            .insert(
              MembershipRolesCompanion.insert(
                merchantId: merchantId,
                membershipId: membership.id,
                roleId: role.id,
                grantedAt: DateTime.now().toUtc().toIso8601String(),
              ),
            );
      }
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'UPDATE',
        entityType: 'user_membership',
        entityId: membership.id,
        shopId: normalizedShop ?? membership.shopId,
        afterData: _updateAuditData(
          displayName: displayName,
          phone: phone,
          password: password,
          isActive: isActive,
          roleId: roleId,
          shopId: normalizedShop,
        ),
      );
    });
    return (await listUsers()).firstWhere(
      (user) => user.membershipId == membership.id,
    );
  }

  @override
  Future<void> delete(String id) async {
    final membership = await _membership(id);
    final assignments = await (database.select(
      database.membershipRoles,
    )..where((row) => row.membershipId.equals(membership.id))).get();
    final roles =
        await (database.select(database.roles)..where(
              (row) =>
                  row.id.isIn(assignments.map((item) => item.roleId).toSet()),
            ))
            .get();
    if (roles.any((role) => role.code == 'merchant')) {
      throw const FormatException('The local owner account cannot be deleted.');
    }
    await database.transaction(() async {
      await (database.update(database.userMemberships)
            ..where((row) => row.id.equals(membership.id)))
          .write(const UserMembershipsCompanion(isActive: Value(false)));
      await (database.update(database.userIdentities)
            ..where((row) => row.id.equals(membership.identityId)))
          .write(const UserIdentitiesCompanion(isActive: Value(false)));
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'DEACTIVATE',
        entityType: 'user_membership',
        entityId: membership.id,
        shopId: membership.shopId,
        afterData: {'is_active': false},
      );
    });
  }

  Future<UserMembership> _membership(String id) async {
    final row =
        await (database.select(database.userMemberships)..where(
              (item) =>
                  item.merchantId.equals(merchantId) &
                  (item.id.equals(id) | item.identityId.equals(id)),
            ))
            .getSingleOrNull();
    if (row == null) {
      throw StateError('Staff account is outside the active merchant.');
    }
    return row;
  }

  Future<Role?> _findRole(String idOrCode) =>
      (database.select(database.roles)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                (row.id.equals(idOrCode) | row.code.equals(idOrCode)),
          ))
          .getSingleOrNull();

  Future<Role> _ensureRole(String code, String now) async {
    final existing = await _findRole(code);
    if (existing != null) return existing;
    final role = Role(
      id: _uuid.v4(),
      merchantId: merchantId,
      code: code,
      name: _title(code),
      isSystem: false,
    );
    await database.into(database.roles).insert(role);
    return role;
  }

  String _email(String value) {
    final normalized = value.trim().toLowerCase();
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(normalized)) {
      throw const FormatException('Enter a valid email address.');
    }
    return normalized;
  }

  Future<String> _requireShop(String? value) async {
    final shopId = value?.trim() ?? '';
    if (shopId.isEmpty) {
      throw const FormatException('A shop assignment is required.');
    }
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null || !shop.isActive) {
      throw const FormatException('The shop assignment is not available.');
    }
    return shopId;
  }

  String _roleCode(String? value) {
    final code = value?.trim().toLowerCase() ?? '';
    return code.isEmpty ? 'staff' : code;
  }

  String? _optional(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  String _title(String value) => value
      .split(RegExp(r'[-_ ]+'))
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');

  Map<String, Object?> _updateAuditData({
    required String? displayName,
    required String? phone,
    required String? password,
    required bool? isActive,
    required String? roleId,
    required String? shopId,
  }) {
    final data = <String, Object?>{};
    if (displayName != null) data['display_name'] = displayName.trim();
    if (phone != null) data['phone_changed'] = true;
    if (password != null && password.isNotEmpty) {
      data['password_changed'] = true;
    }
    if (isActive != null) data['is_active'] = isActive;
    if (roleId != null && roleId.trim().isNotEmpty) {
      data['role_id'] = roleId.trim();
    }
    if (shopId != null) data['shop_id'] = shopId;
    return data;
  }
}
