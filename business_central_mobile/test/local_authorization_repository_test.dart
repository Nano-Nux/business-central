import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/staff/data/local_authorization_repository.dart';
import 'package:business_central_mobile/features/staff/data/local_staff_repository.dart';

void main() {
  late AppDatabase database;
  late String merchantId;
  late String shopId;
  late String ownerMembershipId;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    final setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    merchantId = setup.merchantId;
    shopId = setup.shopId;
    ownerMembershipId = setup.membershipId;
  });

  tearDown(() => database.closeForTest());

  test('owner can scope local role permissions and shop modules', () async {
    final staff = LocalStaffRepository(
      database: database,
      merchantId: merchantId,
      actorMembershipId: ownerMembershipId,
    );
    final user = await staff.create(
      email: 'staff@example.com',
      password: 'staff password',
      displayName: 'Staff',
      roleCode: 'staff',
      shopId: shopId,
    );
    final repository = LocalAuthorizationRepository(
      database: database,
      merchantId: merchantId,
      actorMembershipId: ownerMembershipId,
    );
    final initial = await repository.snapshot(shopId: shopId);
    final staffRole = initial.roles.firstWhere((role) => role.code == 'staff');
    await repository.updateRolePermissions(
      roleId: staffRole.id,
      permissionCodes: {'tenant.read', 'tenant.write'},
    );
    final afterRole = await repository.snapshot(shopId: shopId);
    expect(
      afterRole.roles
          .firstWhere((role) => role.id == staffRole.id)
          .permissionCodes,
      {'tenant.read', 'tenant.write'},
    );

    await repository.setShopModule(
      shopId: shopId,
      moduleCode: 'REPAIR',
      enabled: false,
    );
    final authorization = await LocalAuthService(
      database: database,
    ).authorizationFor(merchantId: merchantId, membershipId: user.membershipId);
    expect(authorization.modules, isNot(contains('REPAIR')));
    expect(
      (await repository.snapshot(
        shopId: shopId,
      )).modules.firstWhere((module) => module.code == 'REPAIR').shopEnabled,
      isFalse,
    );
  });

  test(
    'authorization changes require local rbac scope and tenant shop',
    () async {
      final repository = LocalAuthorizationRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: 'outside-merchant',
      );
      await expectLater(
        repository.setShopModule(
          shopId: shopId,
          moduleCode: 'POS',
          enabled: false,
        ),
        throwsA(isA<StateError>()),
      );
      final ownerRepository = LocalAuthorizationRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: ownerMembershipId,
      );
      final snapshot = await ownerRepository.snapshot(shopId: shopId);
      final ownerRole = snapshot.roles.firstWhere(
        (role) => role.code == 'merchant',
      );
      await expectLater(
        ownerRepository.updateRolePermissions(
          roleId: ownerRole.id,
          permissionCodes: {'tenant.read'},
        ),
        throwsA(isA<FormatException>()),
      );
    },
  );
}
