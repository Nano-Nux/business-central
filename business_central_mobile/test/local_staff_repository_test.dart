import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
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

  test(
    'fully offline staff provisioning and role editing stay scoped',
    () async {
      final repository = LocalStaffRepository(
        database: database,
        merchantId: merchantId,
      );
      final created = await repository.create(
        email: 'cashier@example.com',
        password: 'cashier password 123',
        displayName: 'Cashier',
        phone: '555-0100',
        roleCode: 'cashier',
        shopId: shopId,
      );

      expect(created.email, 'cashier@example.com');
      expect(created.phone, '555-0100');
      expect(created.shopId, shopId);
      expect(created.roles.single.code, 'cashier');
      expect(
        (await repository.listRoles()).map((role) => role.code),
        contains('cashier'),
      );

      final updated = await repository.update(
        created.membershipId,
        displayName: 'Senior Cashier',
        phone: '555-0101',
        isActive: false,
        roleId: 'cashier',
      );
      expect(updated.displayName, 'Senior Cashier');
      expect(updated.phone, '555-0101');
      expect(updated.isActive, isFalse);

      await repository.delete(created.membershipId);
      expect(
        (await repository.listUsers())
            .where((user) => user.membershipId == created.membershipId)
            .single
            .isActive,
        isFalse,
      );
      await expectLater(
        repository.delete(ownerMembershipId),
        throwsA(isA<FormatException>()),
      );
    },
  );

  test('fully offline staff rejects a shop outside the merchant', () async {
    final repository = LocalStaffRepository(
      database: database,
      merchantId: merchantId,
    );
    await expectLater(
      repository.create(
        email: 'other@example.com',
        password: 'other password 123',
        displayName: 'Other',
        shopId: 'other-shop',
      ),
      throwsA(isA<FormatException>()),
    );
  });

  test('fully offline staff cannot assign the owner role', () async {
    final repository = LocalStaffRepository(
      database: database,
      merchantId: merchantId,
      actorMembershipId: ownerMembershipId,
    );
    await expectLater(
      repository.create(
        email: 'escalation@example.com',
        password: 'staff password',
        displayName: 'Escalation',
        roleCode: 'merchant',
        shopId: shopId,
      ),
      throwsA(isA<FormatException>()),
    );
  });
}
