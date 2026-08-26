import '../domain/promotion_models.dart';

abstract interface class PromotionsRepository {
  Future<List<PromotionRecord>> list();

  Future<PromotionRecord> create({
    required String name,
    required String promotionType,
    required String value,
    String? minimumSubtotal,
    int? usageLimit,
    DateTime? startsAt,
    DateTime? endsAt,
  });

  Future<void> delete(String id);
  Future<List<PromotionCode>> listCodes(String promotionId);
  Future<PromotionCode> createCode({
    required String promotionId,
    required String code,
    int? usageLimit,
  });
  Future<void> deleteCode(String id);
  Future<List<PromotionProductScope>> listProductScopes(String promotionId);
  Future<void> assignProductScope({
    required String promotionId,
    required String productId,
    String? variantId,
  });
  Future<void> removeProductScope(String id);
}
