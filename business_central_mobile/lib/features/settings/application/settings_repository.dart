import '../domain/shop_settings_models.dart';

abstract interface class SettingsRepository {
  Future<ShopSettings> load({
    required String merchantId,
    required String shopId,
  });

  Future<ShopSettings> update({
    required String merchantId,
    required String shopId,
    required String name,
    required String code,
    required String timezone,
    bool? includeTax,
    String? taxRate,
    String? taxLabel,
    String? receiptNote,
    String? footerNote,
  });
}
