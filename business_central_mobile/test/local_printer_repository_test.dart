import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/settings/data/local_printer_repository.dart';

void main() {
  late AppDatabase database;
  late LocalOwnerSetupResult setup;
  late LocalPrinterRepository repository;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    repository = LocalPrinterRepository(
      database: database,
      merchantId: setup.merchantId,
      actorMembershipId: setup.membershipId,
    );
  });

  tearDown(() => database.closeForTest());

  test('saves scoped Bluetooth profiles and keeps one default', () async {
    final first = await repository.save(
      shopId: setup.shopId,
      name: 'Front counter',
      connectionType: LocalPrinterConnectionType.bluetooth,
      deviceAddress: 'AA:BB:CC:DD:EE:FF',
      isDefault: true,
      paperWidthMm: 58,
      fontScalePercent: 110,
    );
    final second = await repository.save(
      shopId: setup.shopId,
      name: 'Kitchen printer',
      connectionType: LocalPrinterConnectionType.bluetooth,
      deviceAddress: '11:22:33:44:55:66',
      isDefault: true,
    );

    final profiles = await repository.list(shopId: setup.shopId);
    expect(profiles, hasLength(2));
    expect(profiles.where((profile) => profile.isDefault), hasLength(1));
    expect(profiles.singleWhere((profile) => profile.isDefault).id, second.id);
    expect(first.paperWidthMm, 58);
    expect(first.fontScalePercent, 110);

    final audit = await (database.select(
      database.localAuditEvents,
    )..where((row) => row.entityType.equals('printer_profile'))).get();
    expect(audit, hasLength(2));
    expect(audit.every((event) => event.shopId == setup.shopId), isTrue);
  });

  test('rejects invalid transport details and cross-shop deletion', () async {
    expect(
      () => repository.save(
        shopId: setup.shopId,
        name: 'Missing address',
        connectionType: LocalPrinterConnectionType.bluetooth,
      ),
      throwsA(isA<FormatException>()),
    );
    final profile = await repository.save(
      shopId: setup.shopId,
      name: 'Front counter',
      connectionType: LocalPrinterConnectionType.bluetooth,
      deviceAddress: 'AA:BB:CC:DD:EE:FF',
    );
    expect(
      () => repository.delete(shopId: 'another-shop', id: profile.id),
      throwsA(isA<StateError>()),
    );
    expect(await repository.list(shopId: setup.shopId), hasLength(1));
  });
}
