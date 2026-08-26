import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../application/deliveries_repository.dart';
import '../domain/delivery_models.dart';

class LocalDeliveriesRepository implements DeliveriesRepository {
  LocalDeliveriesRepository({
    required this.database,
    required this.merchantId,
    required this.shopId,
  });

  final AppDatabase database;
  final String merchantId;
  final String shopId;
  static const _uuid = Uuid();

  @override
  Future<List<DeliveryOption>> list({
    required String merchantId,
    required String shopId,
  }) async {
    _requireMerchant(merchantId);
    _requireShopScope(shopId);
    await _requireShop(merchantId, shopId);
    final rows =
        await (database.select(database.localDeliveries)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.shopId.equals(shopId) &
                    row.isActive.equals(true),
              )
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    return [
      for (final row in rows)
        DeliveryOption(
          id: row.id,
          merchantId: row.merchantId,
          shopId: row.shopId,
          name: row.name,
          contactInfo: row.contactInfo,
          isActive: row.isActive,
        ),
    ];
  }

  @override
  Future<DeliveryOption> create({
    required String merchantId,
    required String shopId,
    required String name,
    required String contactInfo,
  }) async {
    _requireMerchant(merchantId);
    _requireShopScope(shopId);
    await _requireShop(merchantId, shopId);
    final normalizedName = name.trim();
    final normalizedContact = contactInfo.trim();
    if (normalizedName.isEmpty || normalizedContact.isEmpty) {
      throw const FormatException('Delivery name and contact are required.');
    }
    final existing =
        await (database.select(database.localDeliveries)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId) &
                  row.name.equals(normalizedName),
            ))
            .getSingleOrNull();
    if (existing != null) {
      throw StateError('A delivery option with this name already exists.');
    }
    final row = LocalDeliveriesCompanion.insert(
      id: _uuid.v4(),
      merchantId: merchantId,
      shopId: shopId,
      name: normalizedName,
      contactInfo: normalizedContact,
      createdAt: DateTime.now().toUtc().toIso8601String(),
    );
    await database.into(database.localDeliveries).insert(row);
    return DeliveryOption(
      id: row.id.value,
      merchantId: merchantId,
      shopId: shopId,
      name: normalizedName,
      contactInfo: normalizedContact,
      isActive: true,
    );
  }

  @override
  Future<void> delete(String id) async {
    final deleted =
        await (database.delete(database.localDeliveries)..where(
              (row) =>
                  row.id.equals(id) &
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId),
            ))
            .go();
    if (deleted == 0) throw StateError('Delivery option was not found.');
  }

  Future<void> requireDelivery({
    required String merchantId,
    required String shopId,
    required String deliveryId,
  }) async {
    _requireMerchant(merchantId);
    _requireShopScope(shopId);
    await _requireShop(merchantId, shopId);
    final row =
        await (database.select(database.localDeliveries)..where(
              (item) =>
                  item.id.equals(deliveryId) &
                  item.merchantId.equals(merchantId) &
                  item.shopId.equals(shopId) &
                  item.isActive.equals(true),
            ))
            .getSingleOrNull();
    if (row == null) {
      throw StateError('Delivery option is outside the active shop.');
    }
  }

  void _requireMerchant(String value) {
    if (value != merchantId) {
      throw StateError('Delivery option is outside the active merchant.');
    }
  }

  void _requireShopScope(String value) {
    if (value != shopId) {
      throw StateError('Delivery option is outside the active shop.');
    }
  }

  Future<void> _requireShop(String merchantId, String shopId) async {
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null) throw StateError('Shop is outside the active merchant.');
  }
}
