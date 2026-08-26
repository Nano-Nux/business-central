class CatalogCategory {
  const CatalogCategory({
    required this.id,
    required this.merchantId,
    required this.name,
    required this.slug,
    this.parentId,
    this.sortOrder = 0,
  });

  final String id;
  final String merchantId;
  final String name;
  final String slug;
  final String? parentId;
  final int sortOrder;

  factory CatalogCategory.fromJson(Map<String, Object?> json) =>
      CatalogCategory(
        id: json['id'] as String,
        merchantId: json['merchant_id'] as String? ?? '',
        name: json['name'] as String,
        slug: json['slug'] as String,
        parentId: json['parent_category_id'] as String?,
        sortOrder: json['sort_order'] as int? ?? 0,
      );
}

class CatalogProduct {
  const CatalogProduct({
    required this.id,
    required this.merchantId,
    required this.name,
    required this.productType,
    required this.isActive,
    required this.categoryNames,
    this.categoryIds = const [],
    this.description,
  });

  final String id;
  final String merchantId;
  final String name;
  final String productType;
  final bool isActive;
  final List<String> categoryNames;
  final List<String> categoryIds;
  final String? description;

  factory CatalogProduct.fromJson(Map<String, Object?> json) => CatalogProduct(
    id: json['id'] as String,
    merchantId: json['merchant_id'] as String? ?? '',
    name: json['name'] as String,
    productType: json['product_type'] as String? ?? 'PHYSICAL',
    isActive: json['is_active'] as bool? ?? true,
    categoryIds: [
      for (final value in (json['category_ids'] as List<Object?>? ?? const []))
        value as String,
    ],
    categoryNames: [
      for (final value
          in (json['category_names'] as List<Object?>? ?? const []))
        value as String,
    ],
    description: json['description'] as String?,
  );
}

class CatalogVariant {
  const CatalogVariant({
    required this.id,
    required this.merchantId,
    required this.productId,
    required this.sku,
    required this.name,
    required this.baseUnitId,
    required this.unitOfMeasure,
    required this.isStockTracked,
    this.barcode,
    this.quantityOnHand,
    this.price,
  });

  final String id;
  final String merchantId;
  final String productId;
  final String sku;
  final String? barcode;
  final String name;
  final String baseUnitId;
  final String unitOfMeasure;
  final bool isStockTracked;
  final String? quantityOnHand;
  final String? price;

  factory CatalogVariant.fromJson(Map<String, Object?> json) => CatalogVariant(
    id: json['id'] as String,
    merchantId: json['merchant_id'] as String? ?? '',
    productId: json['product_id'] as String,
    sku: json['sku'] as String,
    barcode: json['barcode'] as String?,
    name: json['name'] as String,
    baseUnitId: json['base_unit_id'] as String,
    unitOfMeasure: json['unit_of_measure'] as String? ?? '',
    isStockTracked: json['is_stock_tracked'] as bool? ?? false,
    quantityOnHand: json['quantity_on_hand'] as String?,
    price: json['price'] as String?,
  );
}

class CatalogPriceList {
  const CatalogPriceList({
    required this.id,
    required this.merchantId,
    required this.code,
    required this.currencyCode,
    required this.isDefault,
  });

  final String id;
  final String merchantId;
  final String code;
  final String currencyCode;
  final bool isDefault;

  factory CatalogPriceList.fromJson(Map<String, Object?> json) {
    return CatalogPriceList(
      id: json['id'] as String,
      merchantId: json['merchant_id'] as String? ?? '',
      code: json['code'] as String,
      currencyCode: json['currency_code'] as String,
      isDefault: json['is_default'] as bool? ?? false,
    );
  }
}

class CatalogProductPrice {
  const CatalogProductPrice({
    required this.merchantId,
    required this.priceListId,
    required this.variantId,
    required this.amount,
    required this.validFrom,
    this.validUntil,
  });

  final String merchantId;
  final String priceListId;
  final String variantId;
  final String amount;
  final DateTime validFrom;
  final DateTime? validUntil;

  factory CatalogProductPrice.fromJson(Map<String, Object?> json) {
    return CatalogProductPrice(
      merchantId: json['merchant_id'] as String? ?? '',
      priceListId: json['price_list_id'] as String,
      variantId: json['variant_id'] as String,
      amount: (json['amount'] ?? '0').toString(),
      validFrom: DateTime.parse(json['valid_from'] as String).toUtc(),
      validUntil: json['valid_until'] == null
          ? null
          : DateTime.parse(json['valid_until'] as String).toUtc(),
    );
  }
}
