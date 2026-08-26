import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_audit_repository.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';

void main() {
  late AppDatabase database;
  late String merchantId;
  late String shopId;
  late String membershipId;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    final setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    merchantId = setup.merchantId;
    shopId = setup.shopId;
    membershipId = setup.membershipId;
  });

  tearDown(() => database.closeForTest());

  test('records immutable-shaped events with tenant and actor scope', () async {
    await LocalAuthService(database: database).login(
      email: 'OWNER@example.com',
      password: 'correct horse battery staple',
    );
    final repository = LocalAuditRepository(
      database: database,
      merchantId: merchantId,
      actorMembershipId: membershipId,
    );
    await repository.record(
      action: 'UPDATE',
      entityType: 'shop_settings',
      entityId: 'setting-1',
      shopId: shopId,
      requestId: 'request-1',
      beforeData: const {'footer_note': 'old'},
      afterData: const {'footer_note': 'new'},
    );

    final events = await repository.list(shopId: shopId);
    expect(events, hasLength(3));
    final settingsEvent = events.firstWhere(
      (event) => event.requestId == 'request-1',
    );
    expect(settingsEvent.actorMembershipId, membershipId);
    expect(settingsEvent.beforeData, {'footer_note': 'old'});
    expect(settingsEvent.afterData, {'footer_note': 'new'});
    expect(settingsEvent.requestId, 'request-1');
    expect(settingsEvent.occurredAt.isUtc, isTrue);

    final merchantEvents = await repository.list();
    expect(merchantEvents, hasLength(3));
    expect(
      merchantEvents.map((event) => event.action),
      containsAll(['CREATE', 'LOGIN', 'UPDATE']),
    );
    expect(
      (await LocalAuditRepository(
        database: database,
        merchantId: 'another-merchant',
      ).list()),
      isEmpty,
    );
  });

  test('rejects shop and actor identifiers from another merchant', () async {
    final otherMerchant = 'other-merchant';
    await expectLater(
      LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: 'not-a-member',
      ).record(action: 'CREATE', entityType: 'order'),
      throwsA(isA<StateError>()),
    );
    await expectLater(
      LocalAuditRepository(
        database: database,
        merchantId: merchantId,
      ).record(action: 'CREATE', entityType: 'order', shopId: otherMerchant),
      throwsA(isA<StateError>()),
    );
  });
}
