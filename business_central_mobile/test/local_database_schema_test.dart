import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';

void main() {
  test('opens the current schema and records its version metadata', () async {
    final database = AppDatabase(executor: NativeDatabase.memory());
    addTearDown(database.closeForTest);

    expect(database.schemaVersion, 27);
    expect(await database.select(database.localPriceLists).get(), isEmpty);
    expect(await database.select(database.localPrices).get(), isEmpty);
    expect(await database.select(database.localRepairRecords).get(), isEmpty);
    expect(await database.select(database.localServiceRecords).get(), isEmpty);
    expect(await database.select(database.syncSessions).get(), isEmpty);
    expect(await database.select(database.syncEntityVersions).get(), isEmpty);
    expect(
      await database.select(database.localMeasurementUnits).get(),
      isEmpty,
    );
    expect(
      await database.select(database.localMeasurementConversions).get(),
      isEmpty,
    );
    expect(await database.select(database.localDeliveries).get(), isEmpty);
    expect(
      await database.select(database.localInventoryCostLayers).get(),
      isEmpty,
    );
    expect(
      await database.select(database.localInventoryCostAllocations).get(),
      isEmpty,
    );
    expect(await database.select(database.localPayments).get(), isEmpty);
    expect(await database.select(database.localRefunds).get(), isEmpty);
    expect(await database.select(database.localAuditEvents).get(), isEmpty);
    expect(await database.select(database.localPrinterProfiles).get(), isEmpty);
    expect(
      await database.select(database.localCanonicalRecords).get(),
      isEmpty,
    );
    expect(await database.select(database.localPromotions).get(), isEmpty);
    expect(await database.select(database.localPromotionCodes).get(), isEmpty);
    expect(await database.select(database.localPromotionScopes).get(), isEmpty);
    expect(await database.select(database.localOrderPromotions).get(), isEmpty);

    final metadata = await (database.select(
      database.appMetadata,
    )..where((row) => row.key.equals('schema_version'))).getSingle();
    expect(metadata.value, '27');
  });
}
