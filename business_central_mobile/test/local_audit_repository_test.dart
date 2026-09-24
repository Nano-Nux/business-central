import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_audit_repository.dart';

void main() {
  late AppDatabase database;
  const merchantId = 'm-audit-1';
  const shopId = 's-audit-1';
  const membershipId = 'mem-audit-1';

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    await database
        .into(database.merchants)
        .insert(
          MerchantsCompanion.insert(
            id: merchantId,
            name: 'Audit Merchant',
            slug: 'audit-merchant',
            currencyCode: 'USD',
            createdAt: '2026-09-18T00:00:00Z',
          ),
        );
    await database
        .into(database.shops)
        .insert(
          ShopsCompanion.insert(
            id: shopId,
            merchantId: merchantId,
            name: 'Audit Shop',
            code: 'AUDIT',
            createdAt: '2026-09-18T00:00:00Z',
          ),
        );
    await database
        .into(database.userMemberships)
        .insert(
          UserMembershipsCompanion.insert(
            id: membershipId,
            merchantId: merchantId,
            identityId: 'id-1',
            displayName: 'Audit User',
            createdAt: '2026-09-18T00:00:00Z',
          ),
        );
  });

  tearDown(() async {
    await database.close();
  });

  test('records immutable-shaped events with tenant and actor scope', () async {
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
    expect(events, hasLength(1));
    final settingsEvent = events.first;
    expect(settingsEvent.actorMembershipId, membershipId);
    expect(settingsEvent.beforeData, {'footer_note': 'old'});
    expect(settingsEvent.afterData, {'footer_note': 'new'});
    expect(settingsEvent.requestId, 'request-1');
    expect(settingsEvent.occurredAt.isUtc, isTrue);

    final merchantEvents = await repository.list();
    expect(merchantEvents, hasLength(1));
    expect(merchantEvents.first.action, 'UPDATE');

    expect(
      await LocalAuditRepository(
        database: database,
        merchantId: 'another-merchant',
      ).list(),
      isEmpty,
    );
  });

  test('rejects shop and actor identifiers from another merchant', () async {
    const otherMerchant = 'other-merchant';
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
