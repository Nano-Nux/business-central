import '../domain/pos_models.dart';

abstract interface class PosRepository {
  Future<List<PosCatalogItem>> catalog({required String shopId});
  Future<List<PosCatalogItem>> lookupBarcode({
    required String shopId,
    required String barcode,
  });
  Future<PosQuote> quote({
    required String shopId,
    required List<PosCartLine> lines,
    String? deliveryId,
    String? promotionId,
  });

  Future<PosCheckoutResult> checkout({
    required String shopId,
    required List<PosCartLine> lines,
    required String paymentMethod,
    String? customerName,
    String? customerPhone,
    String? deliveryId,
    String? deliveryFee,
    String? manualPromotion,
    String? note,
    String? promotionId,
    String? idempotencyKey,
  });

  Future<PosRefund> refund({
    required String orderId,
    required String paymentId,
    required String amount,
    String? reason,
    String? idempotencyKey,
  });
}
