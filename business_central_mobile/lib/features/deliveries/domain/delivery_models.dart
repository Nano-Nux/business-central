class DeliveryOption {
  const DeliveryOption({
    required this.id,
    required this.merchantId,
    required this.shopId,
    required this.name,
    required this.contactInfo,
    required this.isActive,
  });

  final String id;
  final String merchantId;
  final String shopId;
  final String name;
  final String contactInfo;
  final bool isActive;

  factory DeliveryOption.fromJson(
    Map<String, Object?> json, {
    required String merchantId,
    required String shopId,
  }) {
    final payloadMerchantId = json['merchant_id'] as String?;
    final payloadShopId = json['shop_id'] as String?;
    if ((payloadMerchantId != null &&
            payloadMerchantId.isNotEmpty &&
            payloadMerchantId != merchantId) ||
        (payloadShopId != null &&
            payloadShopId.isNotEmpty &&
            payloadShopId != shopId)) {
      throw StateError('Delivery option is outside the active scope.');
    }
    return DeliveryOption(
      id: json['id'] as String,
      merchantId: merchantId,
      shopId: shopId,
      name: json['name'] as String,
      contactInfo: json['contact_info'] as String? ?? '',
      isActive: json['is_active'] as bool? ?? true,
    );
  }
}
