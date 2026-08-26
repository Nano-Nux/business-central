import '../domain/delivery_models.dart';

abstract interface class DeliveriesRepository {
  Future<List<DeliveryOption>> list({
    required String merchantId,
    required String shopId,
  });

  Future<DeliveryOption> create({
    required String merchantId,
    required String shopId,
    required String name,
    required String contactInfo,
  });

  Future<void> delete(String id);
}
