import 'package:drift/drift.dart';

import '../../../core/database/app_database.dart';
import '../domain/inventory_models.dart';

class InventoryCacheRepository {
  InventoryCacheRepository(this.database);
  final AppDatabase database;

  Future<void> saveLocations({
    required String merchantId,
    required List<InventoryLocation> locations,
  }) async {
    if (locations.any((location) => location.merchantId != merchantId)) {
      throw StateError('Inventory cache received another merchant location.');
    }
    await database.transaction(() async {
      final now = DateTime.now().toUtc().toIso8601String();
      for (final location in locations) {
        await database
            .into(database.locations)
            .insertOnConflictUpdate(
              LocationsCompanion.insert(
                id: location.id,
                merchantId: merchantId,
                shopId: Value(location.shopId),
                code: location.code,
                name: location.name,
                locationType: location.locationType,
                isActive: Value(location.isActive),
                createdAt: now,
              ),
            );
      }
    });
  }

  Future<List<InventoryLocation>> locations({
    required String merchantId,
    required String shopId,
  }) async {
    final rows =
        await (database.select(database.locations)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.shopId.equals(shopId),
              )
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    return [
      for (final row in rows)
        InventoryLocation(
          id: row.id,
          merchantId: row.merchantId,
          shopId: row.shopId,
          code: row.code,
          name: row.name,
          locationType: row.locationType,
          isActive: row.isActive,
        ),
    ];
  }
}
