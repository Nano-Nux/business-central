import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/settings/data/local_settings_repository.dart';
import 'package:business_central_mobile/features/settings/data/local_repair_specifications_repository.dart';

void main() {
  late AppDatabase database;
  late LocalOwnerSetupResult setup;
  late LocalSettingsRepository settings;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    settings = LocalSettingsRepository(database: database);
  });

  tearDown(() => database.closeForTest());

  test('loads and updates merchant-scoped local shop settings', () async {
    final before = await settings.load(
      merchantId: setup.merchantId,
      shopId: setup.shopId,
    );
    expect(before.timezone, 'UTC');

    final after = await settings.update(
      merchantId: setup.merchantId,
      shopId: setup.shopId,
      name: 'Updated Shop',
      code: 'UPDATED',
      timezone: 'Asia/Bangkok',
      taxRate: '7.00',
      taxLabel: 'VAT',
      receiptNote: 'Thank you',
      footerNote: 'Local receipt',
    );
    expect(after.name, 'Updated Shop');
    expect(after.code, 'UPDATED');
    expect(after.timezone, 'Asia/Bangkok');
    expect(after.taxRate, '7.00');
    expect(after.taxLabel, 'VAT');
    expect(after.receiptNote, 'Thank you');
    expect(after.footerNote, 'Local receipt');
  });

  test('rejects a shop outside the active merchant', () async {
    expect(
      () => settings.load(merchantId: setup.merchantId, shopId: 'another-shop'),
      throwsA(isA<StateError>()),
    );
  });

  test(
    'persists repair specifications with normalized presets and audit',
    () async {
      final specifications = LocalRepairSpecificationsRepository(
        database: database,
      );
      final saved = await specifications.save(
        merchantId: setup.merchantId,
        shopId: setup.shopId,
        faultPresets: const [
          'Won\'t power on, Broken screen',
          'broken screen',
          'Water damage',
        ],
        defaultDuration: '3 business days',
      );

      expect(saved.faultPresets, [
        'Won\'t power on',
        'Broken screen',
        'Water damage',
      ]);
      expect(saved.defaultDuration, '3 business days');

      final loaded = await specifications.load(
        merchantId: setup.merchantId,
        shopId: setup.shopId,
      );
      expect(loaded.faultPresets, saved.faultPresets);
      final audit = await (database.select(
        database.localAuditEvents,
      )..where((row) => row.entityType.equals('repair_specifications'))).get();
      expect(audit, hasLength(1));
      expect(audit.single.shopId, setup.shopId);
    },
  );
}
