import '../domain/shop_settings_models.dart';

abstract interface class RepairSpecificationsRepository {
  Future<RepairSpecifications> load({
    required String merchantId,
    required String shopId,
  });

  Future<RepairSpecifications> save({
    required String merchantId,
    required String shopId,
    required List<String> faultPresets,
    required String defaultDuration,
  });
}
