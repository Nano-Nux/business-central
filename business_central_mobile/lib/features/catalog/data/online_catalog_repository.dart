import '../../../core/network/network_boundary.dart';
import '../../../features/auth/data/online_auth_api.dart';
import '../application/catalog_repository.dart';
import '../domain/catalog_models.dart';
import 'catalog_cache_repository.dart';

class OnlineCatalogRepository implements CatalogRepository {
  OnlineCatalogRepository(this.api, this.cache);
  final OnlineAuthApi api;
  final CatalogCacheRepository cache;

  @override
  Future<List<CatalogCategory>> listCategories({
    required String merchantId,
  }) async {
    try {
      final categories = [
        for (final item in await api.getCollection(
          '/catalog/categories?page_index=0&page_size=200',
        ))
          CatalogCategory.fromJson(item),
      ];
      await cache.saveCategories(
        merchantId: merchantId,
        categories: categories,
      );
      return categories;
    } on NetworkDeniedException {
      return cache.categories(merchantId);
    }
  }

  @override
  Future<List<CatalogProduct>> listProducts({
    required String merchantId,
  }) async {
    try {
      final products = [
        for (final item in await api.getCollection(
          '/catalog/products?page_index=0&page_size=100',
        ))
          CatalogProduct.fromJson(item),
      ];
      await cache.saveProducts(merchantId: merchantId, products: products);
      return products;
    } on NetworkDeniedException {
      return cache.products(merchantId);
    }
  }

  @override
  Future<List<CatalogVariant>> listVariants({
    required String merchantId,
    required String productId,
  }) async {
    final variants = [
      for (final item in await api.getCollection(
        '/catalog/products/$productId/variants?page_index=0&page_size=100',
      ))
        CatalogVariant.fromJson(item),
    ];
    if (variants.any(
      (variant) =>
          variant.merchantId.isNotEmpty && variant.merchantId != merchantId,
    )) {
      throw StateError('Catalog variants belong to another merchant.');
    }
    return variants;
  }

  @override
  Future<CatalogCategory> createCategory({
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  }) async {
    final data = await api.postResource('/catalog/categories', {
      'name': name.trim(),
      'slug': slug.trim(),
      if (parentId != null && parentId.trim().isNotEmpty)
        'parent_category_id': parentId,
      ...?(sortOrder == null ? null : {'sort_order': sortOrder}),
    });
    return CatalogCategory.fromJson(data);
  }

  @override
  Future<CatalogCategory> updateCategory({
    required String id,
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  }) async {
    final data = await api.patchResource('/catalog/categories/$id', {
      'name': name.trim(),
      'slug': slug.trim(),
      'parent_category_id': parentId,
      ...?(sortOrder == null ? null : {'sort_order': sortOrder}),
    });
    return CatalogCategory.fromJson(data);
  }

  @override
  Future<void> deleteCategory({required String id}) {
    return api.deleteResource('/catalog/categories/$id');
  }

  @override
  Future<CatalogProduct> createProduct({
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  }) async {
    final data = await api.postResource('/catalog/products', {
      'name': name.trim(),
      'product_type': productType,
      'is_active': isActive,
      'category_ids': categoryIds,
    });
    return CatalogProduct.fromJson(data);
  }

  @override
  Future<CatalogProduct> updateProduct({
    required String id,
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  }) async {
    final data = await api.patchResource('/catalog/products/$id', {
      'name': name.trim(),
      'product_type': productType,
      'is_active': isActive,
      'category_ids': categoryIds,
    });
    return CatalogProduct.fromJson(data);
  }

  @override
  Future<void> deleteProduct({required String id}) {
    return api.deleteResource('/catalog/products/$id');
  }

  @override
  Future<CatalogVariant> createVariant({
    required String productId,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    required bool isStockTracked,
  }) async {
    final data = await api
        .postResource('/catalog/products/$productId/variants', {
          'sku': sku.trim(),
          'name': name.trim(),
          'base_unit_id': baseUnitId,
          'is_stock_tracked': isStockTracked,
          if (barcode != null && barcode.trim().isNotEmpty)
            'barcode': barcode.trim(),
          if (unitOfMeasure != null && unitOfMeasure.trim().isNotEmpty)
            'unit_of_measure': unitOfMeasure.trim(),
        });
    return CatalogVariant.fromJson(data);
  }

  @override
  Future<CatalogVariant> updateVariant({
    required String id,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    required bool isStockTracked,
  }) async {
    final data = await api.patchResource('/catalog/variants/$id', {
      'sku': sku.trim(),
      'name': name.trim(),
      'base_unit_id': baseUnitId,
      'is_stock_tracked': isStockTracked,
      'barcode': barcode,
      if (unitOfMeasure != null && unitOfMeasure.trim().isNotEmpty)
        'unit_of_measure': unitOfMeasure.trim(),
    });
    return CatalogVariant.fromJson(data);
  }

  @override
  Future<void> deleteVariant({required String id}) {
    return api.deleteResource('/catalog/variants/$id');
  }
}
