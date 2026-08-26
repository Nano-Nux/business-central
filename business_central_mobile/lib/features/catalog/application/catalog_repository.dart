import '../domain/catalog_models.dart';

abstract interface class CatalogRepository {
  Future<List<CatalogCategory>> listCategories({required String merchantId});
  Future<List<CatalogProduct>> listProducts({required String merchantId});

  Future<List<CatalogVariant>> listVariants({
    required String merchantId,
    required String productId,
  });

  Future<CatalogCategory> createCategory({
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  });

  Future<CatalogCategory> updateCategory({
    required String id,
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  });

  Future<void> deleteCategory({required String id});

  Future<CatalogProduct> createProduct({
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  });

  Future<CatalogProduct> updateProduct({
    required String id,
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  });

  Future<void> deleteProduct({required String id});

  Future<CatalogVariant> createVariant({
    required String productId,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    required bool isStockTracked,
  });

  Future<CatalogVariant> updateVariant({
    required String id,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    required bool isStockTracked,
  });

  Future<void> deleteVariant({required String id});
}

abstract interface class PricingRepository {
  Future<List<CatalogPriceList>> listPriceLists({required String merchantId});

  Future<List<CatalogProductPrice>> listPrices({required String priceListId});

  Future<CatalogPriceList> createPriceList({
    required String code,
    required String currencyCode,
    required bool isDefault,
  });

  Future<void> deletePriceList({required String id});

  Future<CatalogProductPrice> upsertPrice({
    required String priceListId,
    required String variantId,
    required String amount,
  });

  Future<void> deletePrice({
    required String priceListId,
    required String variantId,
  });
}
