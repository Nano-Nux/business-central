import '../../../features/auth/data/online_auth_api.dart';
import 'package:uuid/uuid.dart';

import '../application/pos_repository.dart';
import '../domain/pos_models.dart';

class OnlinePosRepository implements PosRepository {
  OnlinePosRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<PosCatalogItem>> catalog({required String shopId}) async => [
    for (final item in await api.getCollection(
      '/pos/catalog?page_index=0&page_size=200&shop_id=${Uri.encodeQueryComponent(shopId)}',
    ))
      PosCatalogItem.fromJson(item),
  ];

  @override
  Future<List<PosCatalogItem>> lookupBarcode({
    required String shopId,
    required String barcode,
  }) async => [
    for (final item in await api.getCollection(
      '/pos/barcode-lookup?barcode=${Uri.encodeQueryComponent(barcode)}&shop_id=${Uri.encodeQueryComponent(shopId)}',
    ))
      PosCatalogItem.fromJson(item),
  ];

  @override
  Future<PosQuote> quote({
    required String shopId,
    required List<PosCartLine> lines,
    String? deliveryId,
    String? promotionId,
  }) async {
    if (lines.isEmpty) {
      throw const FormatException(
        'Add at least one item before requesting a quote.',
      );
    }
    final data = await api.postResource('/pos/quote', {
      'shop_id': shopId,
      if (deliveryId != null && deliveryId.trim().isNotEmpty)
        'delivery_id': deliveryId.trim(),
      if (promotionId != null && promotionId.trim().isNotEmpty)
        'promotion_id': promotionId.trim(),
      'lines': [
        for (final line in lines)
          {
            'variant_id': line.item.id,
            'quantity': line.quantity.toString(),
            if (line.item.stockAssetId != null)
              'asset_id': line.item.stockAssetId,
          },
      ],
    });
    return PosQuote.fromJson(data);
  }

  @override
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
  }) async {
    if (lines.isEmpty) {
      throw const FormatException(
        'Add at least one item before completing checkout.',
      );
    }
    final normalizedPaymentMethod = paymentMethod.trim().toUpperCase();
    const supportedPaymentMethods = {
      'CASH',
      'CARD',
      'QR',
      'BANK_TRANSFER',
      'ONLINE',
      'WALLET',
      'OTHER',
    };
    if (!supportedPaymentMethods.contains(normalizedPaymentMethod)) {
      throw FormatException('Unsupported payment method: $paymentMethod');
    }
    final data = await api.postResource('/pos/orders', {
      'shop_id': shopId,
      'lines': [
        for (final line in lines)
          {
            'variant_id': line.item.id,
            'quantity': line.quantity.toString(),
            if (line.item.stockAssetId != null)
              'asset_id': line.item.stockAssetId,
          },
      ],
      'payment_method': normalizedPaymentMethod,
      'idempotency_key': idempotencyKey ?? Uuid().v4(),
      if (customerName != null && customerName.trim().isNotEmpty)
        'customer_name': customerName.trim(),
      if (customerPhone != null && customerPhone.trim().isNotEmpty)
        'customer_phone': customerPhone.trim(),
      if (deliveryId != null && deliveryId.trim().isNotEmpty)
        'delivery_id': deliveryId.trim(),
      if (deliveryFee != null && deliveryFee.trim().isNotEmpty)
        'delivery_fee': deliveryFee.trim(),
      if (manualPromotion != null && manualPromotion.trim().isNotEmpty)
        'manual_promotion': manualPromotion.trim(),
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      if (promotionId != null && promotionId.trim().isNotEmpty)
        'promotion_id': promotionId.trim(),
    });
    return PosCheckoutResult.fromJson(data);
  }

  @override
  Future<PosRefund> refund({
    required String orderId,
    required String paymentId,
    required String amount,
    String? reason,
    String? idempotencyKey,
  }) async {
    final normalizedAmount = amount.trim();
    if (normalizedAmount.isEmpty) {
      throw const FormatException('Refund amount is required.');
    }
    final data = await api.postResource('/pos/orders/$orderId/refunds', {
      'payment_id': paymentId,
      'amount': normalizedAmount,
      'idempotency_key': idempotencyKey ?? const Uuid().v4(),
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    });
    return PosRefund.fromJson(data);
  }
}
