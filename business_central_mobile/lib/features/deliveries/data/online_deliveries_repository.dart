import '../../../features/auth/data/online_auth_api.dart';
import '../application/deliveries_repository.dart';
import '../domain/delivery_models.dart';

class OnlineDeliveriesRepository implements DeliveriesRepository {
  OnlineDeliveriesRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<DeliveryOption>> list({
    required String merchantId,
    required String shopId,
  }) async => [
    for (final item in await api.getCollection(
      '/shops/$shopId/deliveries?page_index=0&page_size=100',
    ))
      DeliveryOption.fromJson(item, merchantId: merchantId, shopId: shopId),
  ];

  @override
  Future<DeliveryOption> create({
    required String merchantId,
    required String shopId,
    required String name,
    required String contactInfo,
  }) async {
    final item = await api.postResource('/deliveries', {
      'shop_id': shopId,
      'name': name.trim(),
      'contact_info': contactInfo.trim(),
    });
    return DeliveryOption.fromJson(
      item,
      merchantId: merchantId,
      shopId: shopId,
    );
  }

  @override
  Future<void> delete(String id) => api.deleteResource('/deliveries/$id');
}
