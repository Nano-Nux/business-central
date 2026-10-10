import 'package:drift/native.dart';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';

void main() {
  test(
    'version 27 preserves collected delivery fees during SQLite upgrade',
    () async {
      final folder = await Directory.systemTemp.createTemp(
        'bc-delivery-schema-',
      );
      final file = File('${folder.path}/app.db');
      var database = AppDatabase(executor: NativeDatabase(file));
      addTearDown(() async {
        await database.closeForTest();
        await folder.delete(recursive: true);
      });
      await database.customStatement(
        "INSERT INTO local_orders(id,merchant_id,shop_id,number,status,currency_code,subtotal,discount_total,tax_total,grand_total,payment_method,idempotency_key,created_at) VALUES('legacy','merchant','shop','POS-OLD','COMPLETED','USD','100.00','10.00','9.00','106.00','Cash','legacy','2026-10-08')",
      );
      await database.customStatement(
        "INSERT INTO local_payments(id,merchant_id,order_id,method,status,amount,idempotency_key,created_at) VALUES('receipt','merchant','legacy','Cash','COMPLETED','106.00','payment','2026-10-08')",
      );
      await database.customStatement(
        'ALTER TABLE local_orders DROP COLUMN delivery_payment_status',
      );
      await database.customStatement(
        'ALTER TABLE local_orders DROP COLUMN delivery_fee',
      );
      await database.customStatement(
        'ALTER TABLE local_payments DROP COLUMN purpose',
      );
      await database.customStatement('PRAGMA user_version=27');
      await database.closeForTest();
      database = AppDatabase(executor: NativeDatabase(file));
      final order = await database.select(database.localOrders).getSingle();
      expect(order.deliveryPaymentStatus, 'COMPLETE');
      expect(order.deliveryFee, '7.00');
      expect(order.grandTotal, '106.00');
      expect(
        (await database.select(database.localPayments).getSingle()).purpose,
        'ORDER',
      );
    },
  );
  test('opens the current schema and records its version metadata', () async {
    final database = AppDatabase(executor: NativeDatabase.memory());
    addTearDown(database.closeForTest);

    expect(database.schemaVersion, 28);
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
    expect(metadata.value, '28');
  });
}
