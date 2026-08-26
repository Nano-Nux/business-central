import 'package:drift/drift.dart';

import '../../../core/database/app_database.dart';
import 'online_auth_api.dart';

class WorkspaceCacheRepository {
  WorkspaceCacheRepository(this.database);
  final AppDatabase database;

  Future<void> save({
    required OnlineMerchant merchant,
    required List<OnlineShop> shops,
  }) {
    final now = DateTime.now().toUtc().toIso8601String();
    if (shops.any((shop) => shop.merchantId != merchant.id)) {
      throw StateError(
        'Cannot cache a shop outside the authenticated merchant.',
      );
    }
    return database.transaction(() async {
      await database
          .into(database.merchants)
          .insertOnConflictUpdate(
            MerchantsCompanion.insert(
              id: merchant.id,
              name: merchant.name,
              slug: merchant.slug,
              currencyCode: merchant.currencyCode,
              createdAt: now,
            ),
          );
      for (final shop in shops) {
        await database
            .into(database.shops)
            .insertOnConflictUpdate(
              ShopsCompanion.insert(
                id: shop.id,
                merchantId: shop.merchantId,
                name: shop.name,
                code: shop.code,
                footerNote: Value(shop.footerNote),
                timezone: Value(shop.timezone),
                createdAt: now,
              ),
            );
      }
    });
  }
}
