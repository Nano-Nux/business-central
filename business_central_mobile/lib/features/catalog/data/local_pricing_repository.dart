import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../shared/money.dart';
import '../application/catalog_repository.dart';
import '../domain/catalog_models.dart';

class LocalPricingRepository implements PricingRepository {
  LocalPricingRepository({required this.database, required this.merchantId});

  final AppDatabase database;
  final String merchantId;
  static const _uuid = Uuid();
  static const _defaultCode = 'LOCAL-DEFAULT';

  @override
  Future<List<CatalogPriceList>> listPriceLists({
    required String merchantId,
  }) async {
    _requireMerchant(merchantId);
    await _ensureDefaultList();
    final rows = await (database.select(
      database.localPriceLists,
    )..where((row) => row.merchantId.equals(this.merchantId))).get();
    return [for (final row in rows) _priceList(row)];
  }

  @override
  Future<List<CatalogProductPrice>> listPrices({
    required String priceListId,
  }) async {
    await _requirePriceList(priceListId);
    final rows =
        await (database.select(database.localPrices)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.priceListId.equals(priceListId),
            ))
            .get();
    return [for (final row in rows) _price(row)];
  }

  @override
  Future<CatalogPriceList> createPriceList({
    required String code,
    required String currencyCode,
    required bool isDefault,
  }) async {
    final normalizedCode = _required(code, 'Price-list code');
    final normalizedCurrency = _required(
      currencyCode,
      'Currency code',
    ).toUpperCase();
    if (normalizedCurrency.length != 3) {
      throw const FormatException('Currency code must contain three letters.');
    }
    final id = _uuid.v4();
    await database.transaction(() async {
      if (isDefault) {
        await (database.update(database.localPriceLists)
              ..where((row) => row.merchantId.equals(merchantId)))
            .write(const LocalPriceListsCompanion(isDefault: Value(false)));
      }
      await database
          .into(database.localPriceLists)
          .insert(
            LocalPriceListsCompanion.insert(
              id: id,
              merchantId: merchantId,
              code: normalizedCode,
              currencyCode: normalizedCurrency,
              isDefault: Value(isDefault),
              createdAt: _now(),
            ),
          );
    });
    return _priceList(await _singlePriceList(id));
  }

  @override
  Future<void> deletePriceList({required String id}) async {
    await _requirePriceList(id);
    await database.transaction(() async {
      await (database.delete(database.localPrices)..where(
            (row) =>
                row.merchantId.equals(merchantId) & row.priceListId.equals(id),
          ))
          .go();
      await (database.delete(database.localPriceLists)..where(
            (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
          ))
          .go();
      await _ensureDefaultList();
    });
  }

  @override
  Future<CatalogProductPrice> upsertPrice({
    required String priceListId,
    required String variantId,
    required String amount,
  }) async {
    await _requirePriceList(priceListId);
    await _requireVariant(variantId);
    final normalizedAmount = ExactMoney.parse(
      amount,
      decimalPlaces: 2,
    ).toDecimalString();
    final existing =
        await (database.select(database.localPrices)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.priceListId.equals(priceListId) &
                  row.variantId.equals(variantId),
            ))
            .getSingleOrNull();
    final now = _now();
    if (existing == null) {
      await database
          .into(database.localPrices)
          .insert(
            LocalPricesCompanion.insert(
              id: _uuid.v4(),
              merchantId: merchantId,
              priceListId: priceListId,
              variantId: variantId,
              amount: normalizedAmount,
              validFrom: now,
            ),
          );
    } else {
      await (database.update(database.localPrices)..where(
            (row) =>
                row.id.equals(existing.id) & row.merchantId.equals(merchantId),
          ))
          .write(
            LocalPricesCompanion(
              amount: Value(normalizedAmount),
              validFrom: Value(now),
            ),
          );
    }
    await (database.update(database.cachedCatalogVariants)..where(
          (row) => row.id.equals(variantId) & row.merchantId.equals(merchantId),
        ))
        .write(CachedCatalogVariantsCompanion(price: Value(normalizedAmount)));
    return _price(
      await (database.select(database.localPrices)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.priceListId.equals(priceListId) &
                row.variantId.equals(variantId),
          ))
          .getSingle(),
    );
  }

  @override
  Future<void> deletePrice({
    required String priceListId,
    required String variantId,
  }) async {
    await _requirePriceList(priceListId);
    await _requireVariant(variantId);
    await (database.delete(database.localPrices)..where(
          (row) =>
              row.merchantId.equals(merchantId) &
              row.priceListId.equals(priceListId) &
              row.variantId.equals(variantId),
        ))
        .go();
    await (database.update(database.cachedCatalogVariants)..where(
          (row) => row.id.equals(variantId) & row.merchantId.equals(merchantId),
        ))
        .write(const CachedCatalogVariantsCompanion(price: Value(null)));
  }

  Future<void> _ensureDefaultList() async {
    final existing =
        await (database.select(database.localPriceLists)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.code.equals(_defaultCode),
            ))
            .getSingleOrNull();
    if (existing != null) return;
    final merchant = await (database.select(
      database.merchants,
    )..where((row) => row.id.equals(merchantId))).getSingleOrNull();
    if (merchant == null) throw StateError('Merchant is outside local scope.');
    await database
        .into(database.localPriceLists)
        .insert(
          LocalPriceListsCompanion.insert(
            id: _uuid.v4(),
            merchantId: merchantId,
            code: _defaultCode,
            currencyCode: merchant.currencyCode,
            isDefault: const Value(true),
            createdAt: _now(),
          ),
        );
  }

  Future<LocalPriceList> _singlePriceList(String id) =>
      (database.select(database.localPriceLists)..where(
            (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
          ))
          .getSingle();

  Future<LocalPriceList> _requirePriceList(String id) async {
    final row =
        await (database.select(database.localPriceLists)..where(
              (entry) =>
                  entry.id.equals(id) & entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (row == null) throw StateError('Price list is outside local scope.');
    return row;
  }

  Future<void> _requireVariant(String id) async {
    final row =
        await (database.select(database.cachedCatalogVariants)..where(
              (entry) =>
                  entry.id.equals(id) & entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (row == null) throw StateError('Variant is outside local scope.');
  }

  CatalogPriceList _priceList(LocalPriceList row) => CatalogPriceList(
    id: row.id,
    merchantId: row.merchantId,
    code: row.code,
    currencyCode: row.currencyCode,
    isDefault: row.isDefault,
  );

  CatalogProductPrice _price(LocalPrice row) => CatalogProductPrice(
    merchantId: row.merchantId,
    priceListId: row.priceListId,
    variantId: row.variantId,
    amount: row.amount,
    validFrom: DateTime.parse(row.validFrom).toUtc(),
    validUntil: row.validUntil == null
        ? null
        : DateTime.parse(row.validUntil!).toUtc(),
  );

  void _requireMerchant(String value) {
    if (value != merchantId) {
      throw StateError('Merchant is outside local scope.');
    }
  }

  String _required(String value, String label) {
    if (value.trim().isEmpty) throw FormatException('$label is required.');
    return value.trim();
  }

  String _now() => DateTime.now().toUtc().toIso8601String();
}
