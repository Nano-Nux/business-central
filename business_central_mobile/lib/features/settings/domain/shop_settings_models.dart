class ShopSettings {
  const ShopSettings({
    required this.id,
    required this.merchantId,
    required this.name,
    required this.code,
    required this.timezone,
    required this.isActive,
    this.includeTax = false,
    this.taxRate,
    this.taxLabel,
    this.receiptNote,
    this.footerNote,
  });

  final String id;
  final String merchantId;
  final String name;
  final String code;
  final String timezone;
  final bool isActive;
  final bool includeTax;
  final String? taxRate;
  final String? taxLabel;
  final String? receiptNote;
  final String? footerNote;

  factory ShopSettings.fromJson(
    Map<String, Object?> json, {
    required String merchantId,
    required String shopId,
  }) {
    if (json['id'] != shopId ||
        (json['merchant_id'] as String? ?? merchantId) != merchantId) {
      throw StateError('Shop settings are outside the active scope.');
    }
    return ShopSettings(
      id: shopId,
      merchantId: merchantId,
      name: json['name'] as String? ?? '',
      code: json['code'] as String? ?? '',
      timezone: json['timezone'] as String? ?? 'UTC',
      isActive: json['is_active'] as bool? ?? true,
      includeTax: json['include_tax'] as bool? ?? false,
      taxRate: json['tax_rate']?.toString(),
      taxLabel: json['tax_label'] as String?,
      receiptNote: json['receipt_note'] as String?,
      footerNote: json['footer_note'] as String?,
    );
  }
}

class RepairSpecifications {
  const RepairSpecifications({
    required this.merchantId,
    required this.shopId,
    required this.faultPresets,
    required this.defaultDuration,
  });

  final String merchantId;
  final String shopId;
  final List<String> faultPresets;
  final String defaultDuration;
}
