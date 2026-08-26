import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../shared/money.dart';
import '../domain/catalog_models.dart';

/// Durable, merchant-scoped catalog storage used only by FULLY_OFFLINE mode.
///
/// These rows are local business truth for a standalone deployment. They are
/// deliberately not exposed through the ONLINE repositories or queued for
/// backend synchronization, because FULLY_OFFLINE mode has no backend.
class LocalCatalogRepository {
  LocalCatalogRepository({required this.database, required this.merchantId});

  final AppDatabase database;
  final String merchantId;
  static const _uuid = Uuid();

  Future<List<CatalogCategory>> listCategories() async {
    final rows =
        await (database.select(database.cachedCatalogCategories)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([
                (row) => OrderingTerm(expression: row.sortOrder),
                (row) => OrderingTerm(expression: row.name),
              ]))
            .get();
    return [
      for (final row in rows)
        CatalogCategory(
          id: row.id,
          merchantId: row.merchantId,
          parentId: row.parentCategoryId,
          name: row.name,
          slug: row.slug,
          sortOrder: row.sortOrder,
        ),
    ];
  }

  Future<List<CatalogProduct>> listProducts() async {
    final rows =
        await (database.select(database.cachedCatalogProducts)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    final links = await (database.select(
      database.cachedCatalogProductCategories,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final categories = await listCategories();
    final namesById = {
      for (final category in categories) category.id: category.name,
    };
    return [
      for (final row in rows)
        CatalogProduct(
          id: row.id,
          merchantId: row.merchantId,
          name: row.name,
          productType: row.productType,
          isActive: row.isActive,
          categoryIds: [
            for (final link in links)
              if (link.productId == row.id) link.categoryId,
          ],
          categoryNames: [
            for (final link in links)
              if (link.productId == row.id &&
                  namesById.containsKey(link.categoryId))
                namesById[link.categoryId]!,
          ],
        ),
    ];
  }

  Future<List<CatalogVariant>> listVariants(String productId) async {
    final rows =
        await (database.select(database.cachedCatalogVariants)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.productId.equals(productId),
              )
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    return [
      for (final row in rows)
        CatalogVariant(
          id: row.id,
          merchantId: row.merchantId,
          productId: row.productId,
          sku: row.sku,
          barcode: row.barcode,
          name: row.name,
          baseUnitId: row.baseUnitId,
          unitOfMeasure: row.unitOfMeasure,
          isStockTracked: row.isStockTracked,
          quantityOnHand: row.quantityOnHand,
          price: row.price,
        ),
    ];
  }

  Future<CatalogCategory> createCategory({
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  }) async {
    final id = _uuid.v4();
    final now = _now();
    await database
        .into(database.cachedCatalogCategories)
        .insert(
          CachedCatalogCategoriesCompanion.insert(
            id: id,
            merchantId: merchantId,
            parentCategoryId: Value(_optional(parentId)),
            name: _required(name, 'Category name'),
            slug: _required(slug, 'Category slug'),
            sortOrder: Value(sortOrder ?? 0),
            updatedAt: now,
          ),
        );
    return (await listCategories()).firstWhere((row) => row.id == id);
  }

  Future<CatalogCategory> updateCategory({
    required String id,
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  }) async {
    final updated =
        await (database.update(database.cachedCatalogCategories)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .write(
              CachedCatalogCategoriesCompanion(
                parentCategoryId: Value(_optional(parentId)),
                name: Value(_required(name, 'Category name')),
                slug: Value(_required(slug, 'Category slug')),
                sortOrder: Value(sortOrder ?? 0),
                updatedAt: Value(_now()),
              ),
            );
    if (updated == 0) {
      throw StateError('Category is outside the active merchant.');
    }
    return (await listCategories()).firstWhere((row) => row.id == id);
  }

  Future<void> deleteCategory(String id) async {
    await database.transaction(() async {
      await (database.delete(database.cachedCatalogProductCategories)..where(
            (row) =>
                row.merchantId.equals(merchantId) & row.categoryId.equals(id),
          ))
          .go();
      final deleted =
          await (database.delete(database.cachedCatalogCategories)..where(
                (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
              ))
              .go();
      if (deleted == 0) {
        throw StateError('Category is outside the active merchant.');
      }
    });
  }

  Future<CatalogProduct> createProduct({
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  }) async {
    final id = _uuid.v4();
    await database.transaction(() async {
      await database
          .into(database.cachedCatalogProducts)
          .insert(
            CachedCatalogProductsCompanion.insert(
              id: id,
              merchantId: merchantId,
              name: _required(name, 'Product name'),
              productType: _required(productType, 'Product type').toUpperCase(),
              isActive: Value(isActive),
              updatedAt: _now(),
            ),
          );
      await _replaceCategoryLinks(id, categoryIds);
    });
    return (await listProducts()).firstWhere((row) => row.id == id);
  }

  Future<CatalogProduct> updateProduct({
    required String id,
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  }) async {
    final updated =
        await (database.update(database.cachedCatalogProducts)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .write(
              CachedCatalogProductsCompanion(
                name: Value(_required(name, 'Product name')),
                productType: Value(
                  _required(productType, 'Product type').toUpperCase(),
                ),
                isActive: Value(isActive),
                updatedAt: Value(_now()),
              ),
            );
    if (updated == 0) {
      throw StateError('Product is outside the active merchant.');
    }
    await database.transaction(() => _replaceCategoryLinks(id, categoryIds));
    return (await listProducts()).firstWhere((row) => row.id == id);
  }

  Future<void> deleteProduct(String id) async {
    await database.transaction(() async {
      await (database.delete(database.cachedCatalogProductCategories)..where(
            (row) =>
                row.merchantId.equals(merchantId) & row.productId.equals(id),
          ))
          .go();
      await (database.delete(database.cachedCatalogVariants)..where(
            (row) =>
                row.merchantId.equals(merchantId) & row.productId.equals(id),
          ))
          .go();
      final deleted =
          await (database.delete(database.cachedCatalogProducts)..where(
                (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
              ))
              .go();
      if (deleted == 0) {
        throw StateError('Product is outside the active merchant.');
      }
    });
  }

  Future<CatalogVariant> createVariant({
    required String productId,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    String? price,
    String? quantityOnHand,
    required bool isStockTracked,
  }) async {
    await _requireProduct(productId);
    final id = _uuid.v4();
    await database
        .into(database.cachedCatalogVariants)
        .insert(
          CachedCatalogVariantsCompanion.insert(
            id: id,
            merchantId: merchantId,
            productId: productId,
            sku: _required(sku, 'SKU'),
            barcode: Value(_optional(barcode)),
            name: _required(name, 'Variant name'),
            baseUnitId: _required(baseUnitId, 'Base unit ID'),
            unitOfMeasure: _optional(unitOfMeasure) ?? 'EA',
            isStockTracked: Value(isStockTracked),
            quantityOnHand: Value(_quantity(quantityOnHand)),
            price: Value(_optional(price)),
            updatedAt: _now(),
          ),
        );
    return (await listVariants(productId)).firstWhere((row) => row.id == id);
  }

  Future<CatalogVariant> updateVariant({
    required String id,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    String? price,
    required bool isStockTracked,
  }) async {
    final updated =
        await (database.update(database.cachedCatalogVariants)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .write(
              CachedCatalogVariantsCompanion(
                sku: Value(_required(sku, 'SKU')),
                barcode: Value(_optional(barcode)),
                name: Value(_required(name, 'Variant name')),
                baseUnitId: Value(_required(baseUnitId, 'Base unit ID')),
                unitOfMeasure: Value(_optional(unitOfMeasure) ?? 'EA'),
                isStockTracked: Value(isStockTracked),
                price: Value(_optional(price)),
                updatedAt: Value(_now()),
              ),
            );
    if (updated == 0) {
      throw StateError('Variant is outside the active merchant.');
    }
    final product =
        await (database.select(database.cachedCatalogVariants)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .getSingle();
    return (await listVariants(
      product.productId,
    )).firstWhere((row) => row.id == id);
  }

  Future<void> deleteVariant(String id) async {
    final deleted =
        await (database.delete(database.cachedCatalogVariants)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .go();
    if (deleted == 0) {
      throw StateError('Variant is outside the active merchant.');
    }
  }

  Future<void> _replaceCategoryLinks(
    String productId,
    List<String> categoryIds,
  ) async {
    final categories =
        await (database.select(database.cachedCatalogCategories)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.id.isIn(categoryIds),
            ))
            .get();
    if (categories.length != categoryIds.toSet().length) {
      throw StateError('Every category must belong to the active merchant.');
    }
    await (database.delete(database.cachedCatalogProductCategories)..where(
          (row) =>
              row.merchantId.equals(merchantId) &
              row.productId.equals(productId),
        ))
        .go();
    for (final categoryId in categoryIds.toSet()) {
      await database
          .into(database.cachedCatalogProductCategories)
          .insert(
            CachedCatalogProductCategoriesCompanion.insert(
              merchantId: merchantId,
              productId: productId,
              categoryId: categoryId,
            ),
          );
    }
  }

  Future<void> _requireProduct(String productId) async {
    final product =
        await (database.select(database.cachedCatalogProducts)..where(
              (row) =>
                  row.id.equals(productId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (product == null) {
      throw StateError('Product is outside the active merchant.');
    }
  }

  String _required(String value, String label) {
    final normalized = value.trim();
    if (normalized.isEmpty) throw FormatException('$label is required.');
    return normalized;
  }

  String? _optional(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  String _quantity(String? value) {
    if (value == null || value.trim().isEmpty) return '0.000';
    return ExactMoney.parse(value, decimalPlaces: 3).toDecimalString();
  }

  String _now() => DateTime.now().toUtc().toIso8601String();
}
