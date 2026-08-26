import '../../../features/auth/data/online_auth_api.dart';
import '../application/promotions_repository.dart';
import '../domain/promotion_models.dart';

class OnlinePromotionsRepository implements PromotionsRepository {
  OnlinePromotionsRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<PromotionRecord>> list() async => [
    for (final item in await api.getCollection(
      '/promotions?page_index=0&page_size=100',
    ))
      PromotionRecord.fromJson(item),
  ];

  @override
  Future<PromotionRecord> create({
    required String name,
    required String promotionType,
    required String value,
    String? minimumSubtotal,
    int? usageLimit,
    DateTime? startsAt,
    DateTime? endsAt,
  }) async {
    final body = <String, Object?>{
      'name': name.trim(),
      'promotion_type': promotionType,
      'value': value.trim(),
    };
    if (minimumSubtotal != null && minimumSubtotal.trim().isNotEmpty) {
      body['minimum_subtotal'] = minimumSubtotal.trim();
    }
    if (usageLimit != null) {
      body['usage_limit'] = usageLimit;
    }
    if (startsAt != null) {
      body['starts_at'] = startsAt.toUtc().toIso8601String();
    }
    if (endsAt != null) {
      body['ends_at'] = endsAt.toUtc().toIso8601String();
    }
    return PromotionRecord.fromJson(
      await api.postResource('/promotions', body),
    );
  }

  @override
  Future<void> delete(String id) => api.deleteResource('/promotions/$id');

  @override
  Future<List<PromotionCode>> listCodes(String promotionId) async => [
    for (final item in await api.getCollection(
      '/promotions/$promotionId/codes?page_index=0&page_size=100',
    ))
      PromotionCode.fromJson(item),
  ];

  @override
  Future<PromotionCode> createCode({
    required String promotionId,
    required String code,
    int? usageLimit,
  }) async {
    final body = <String, Object?>{
      'promotion_id': promotionId,
      'code': code.trim(),
    };
    if (usageLimit != null) {
      body['usage_limit'] = usageLimit;
    }
    return PromotionCode.fromJson(
      await api.postResource('/promotions/codes', body),
    );
  }

  @override
  Future<void> deleteCode(String id) =>
      api.deleteResource('/promotions/codes/$id');

  @override
  Future<List<PromotionProductScope>> listProductScopes(
    String promotionId,
  ) async => [
    for (final item in await api.getCollection(
      '/promotions/$promotionId/products?page_index=0&page_size=100',
    ))
      PromotionProductScope.fromJson(item),
  ];

  @override
  Future<void> assignProductScope({
    required String promotionId,
    required String productId,
    String? variantId,
  }) => api
      .postResource('/promotions/products', {
        'promotion_id': promotionId,
        'product_id': productId,
        if (variantId?.trim().isNotEmpty ?? false)
          'variant_id': variantId!.trim(),
      })
      .then((_) {});

  @override
  Future<void> removeProductScope(String id) =>
      api.deleteResource('/promotions/products/$id');
}
