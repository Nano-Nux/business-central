class PromotionRecord {
  const PromotionRecord({
    required this.id,
    required this.name,
    required this.promotionType,
    required this.value,
    required this.minimumSubtotal,
    required this.redemptionCount,
    required this.isActive,
    this.usageLimit,
    this.startsAt,
    this.endsAt,
  });

  final String id;
  final String name;
  final String promotionType;
  final String value;
  final String minimumSubtotal;
  final int redemptionCount;
  final int? usageLimit;
  final bool isActive;
  final DateTime? startsAt;
  final DateTime? endsAt;

  factory PromotionRecord.fromJson(Map<String, Object?> json) =>
      PromotionRecord(
        id: json['id'] as String,
        name: json['name'] as String,
        promotionType: json['promotion_type'] as String,
        value: (json['value'] ?? '0').toString(),
        minimumSubtotal: (json['minimum_subtotal'] ?? '0').toString(),
        redemptionCount: (json['redemption_count'] as num?)?.toInt() ?? 0,
        usageLimit: (json['usage_limit'] as num?)?.toInt(),
        isActive: json['is_active'] as bool? ?? true,
        startsAt: _date(json['starts_at']),
        endsAt: _date(json['ends_at']),
      );
}

class PromotionCode {
  const PromotionCode({
    required this.id,
    required this.promotionId,
    required this.code,
    required this.isActive,
    required this.redemptionCount,
    this.usageLimit,
  });

  final String id;
  final String promotionId;
  final String code;
  final bool isActive;
  final int redemptionCount;
  final int? usageLimit;

  factory PromotionCode.fromJson(Map<String, Object?> json) => PromotionCode(
    id: json['id'] as String,
    promotionId: json['promotion_id'] as String,
    code: json['code'] as String,
    isActive: json['is_active'] as bool? ?? true,
    usageLimit: (json['usage_limit'] as num?)?.toInt(),
    redemptionCount: (json['redemption_count'] as num?)?.toInt() ?? 0,
  );
}

class PromotionProductScope {
  const PromotionProductScope({
    required this.id,
    required this.promotionId,
    required this.productId,
    required this.productName,
    this.variantId,
    this.variantName,
  });

  final String id;
  final String promotionId;
  final String productId;
  final String productName;
  final String? variantId;
  final String? variantName;

  factory PromotionProductScope.fromJson(Map<String, Object?> json) =>
      PromotionProductScope(
        id: json['id'] as String,
        promotionId: json['promotion_id'] as String,
        productId: json['product_id'] as String,
        productName: json['product_name'] as String? ?? '',
        variantId: json['variant_id'] as String?,
        variantName: json['variant_name'] as String?,
      );
}

DateTime? _date(Object? value) =>
    value == null ? null : DateTime.tryParse(value.toString())?.toUtc();
