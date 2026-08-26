import 'package:drift/drift.dart';

import '../../../core/database/app_database.dart';
import '../domain/catalog_models.dart';

class CatalogCacheRepository {
  CatalogCacheRepository(this.database);
  final AppDatabase database;

  Future<void> saveCategories({
    required String merchantId,
    required List<CatalogCategory> categories,
  }) async {
    _requireMerchant(categories.map((item) => item.merchantId), merchantId);
    final now = DateTime.now().toUtc().toIso8601String();
    await database.transaction(() async {
      for (final category in categories) {
        await database
            .into(database.cachedCatalogCategories)
            .insertOnConflictUpdate(
              CachedCatalogCategoriesCompanion.insert(
                id: category.id,
                merchantId: merchantId,
                parentCategoryId: Value(category.parentId),
                name: category.name,
                slug: category.slug,
                sortOrder: Value(category.sortOrder),
                updatedAt: now,
              ),
            );
      }
    });
  }

  Future<void> saveProducts({
    required String merchantId,
    required List<CatalogProduct> products,
  }) async {
    _requireMerchant(products.map((item) => item.merchantId), merchantId);
    final now = DateTime.now().toUtc().toIso8601String();
    await database.transaction(() async {
      for (final product in products) {
        await database
            .into(database.cachedCatalogProducts)
            .insertOnConflictUpdate(
              CachedCatalogProductsCompanion.insert(
                id: product.id,
                merchantId: merchantId,
                name: product.name,
                productType: product.productType,
                isActive: Value(product.isActive),
                updatedAt: now,
              ),
            );
      }
    });
  }

  Future<List<CatalogCategory>> categories(String merchantId) async {
    final rows =
        await (database.select(database.cachedCatalogCategories)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    return [
      for (final row in rows)
        CatalogCategory(
          id: row.id,
          merchantId: row.merchantId,
          parentId: row.parentCategoryId,
          name: row.name,
          slug: row.slug,
        ),
    ];
  }

  Future<List<CatalogProduct>> products(String merchantId) async {
    final rows =
        await (database.select(database.cachedCatalogProducts)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    return [
      for (final row in rows)
        CatalogProduct(
          id: row.id,
          merchantId: row.merchantId,
          name: row.name,
          productType: row.productType,
          isActive: row.isActive,
          categoryNames: const [],
        ),
    ];
  }

  void _requireMerchant(Iterable<String> rowMerchants, String merchantId) {
    if (rowMerchants.any(
      (rowMerchant) => rowMerchant.isNotEmpty && rowMerchant != merchantId,
    )) {
      throw StateError(
        'Catalog cache received data outside the active merchant.',
      );
    }
  }
}
