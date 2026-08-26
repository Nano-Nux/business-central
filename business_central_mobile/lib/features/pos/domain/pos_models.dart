class PosCatalogItem {
  const PosCatalogItem({
    required this.id,
    required this.name,
    required this.sku,
    required this.isStockTracked,
    this.productName,
    this.barcode,
    this.stockAssetId,
    this.barcodeMatch,
    this.price,
    this.quantityOnHand,
  });
  final String id;
  final String name;
  final String sku;
  final String? productName;
  final String? barcode;
  final String? stockAssetId;
  final String? barcodeMatch;
  final String? price;
  final String? quantityOnHand;
  final bool isStockTracked;

  factory PosCatalogItem.fromJson(Map<String, Object?> json) => PosCatalogItem(
    id: json['id'] as String,
    name: json['name'] as String,
    sku: json['sku'] as String,
    productName: json['product_name'] as String?,
    barcode: json['barcode'] as String?,
    stockAssetId: json['stock_asset_id'] as String?,
    barcodeMatch: json['barcode_match'] as String?,
    price: json['price'] as String?,
    quantityOnHand: json['quantity_on_hand'] as String?,
    isStockTracked: json['is_stock_tracked'] as bool? ?? false,
  );
}

class PosCartLine {
  const PosCartLine({required this.item, required this.quantity});
  final PosCatalogItem item;
  final int quantity;

  PosCartLine copyWith({int? quantity}) =>
      PosCartLine(item: item, quantity: quantity ?? this.quantity);
}

class PosQuote {
  const PosQuote({
    required this.subtotal,
    required this.discountTotal,
    required this.taxTotal,
    required this.grandTotal,
    required this.currencyCode,
  });
  final String subtotal;
  final String discountTotal;
  final String taxTotal;
  final String grandTotal;
  final String currencyCode;

  factory PosQuote.fromJson(Map<String, Object?> json) => PosQuote(
    subtotal: (json['subtotal'] ?? '0').toString(),
    discountTotal: (json['discount_total'] ?? '0').toString(),
    taxTotal: (json['tax_total'] ?? '0').toString(),
    grandTotal: (json['grand_total'] ?? '0').toString(),
    currencyCode: (json['currency_code'] ?? 'USD').toString(),
  );
}

class PosCheckoutResult {
  const PosCheckoutResult({required this.id, this.number, this.status});
  final String id;
  final String? number;
  final String? status;

  factory PosCheckoutResult.fromJson(Map<String, Object?> json) =>
      PosCheckoutResult(
        id: json['id'] as String,
        number: json['number'] as String?,
        status: json['status'] as String?,
      );
}

class PosRefund {
  const PosRefund({
    required this.id,
    required this.paymentId,
    required this.orderId,
    required this.status,
    required this.amount,
    this.reason,
    this.createdAt,
  });

  final String id;
  final String paymentId;
  final String orderId;
  final String status;
  final String amount;
  final String? reason;
  final DateTime? createdAt;

  factory PosRefund.fromJson(Map<String, Object?> json) => PosRefund(
    id: json['id'] as String,
    paymentId: json['payment_id'] as String,
    orderId: json['order_id'] as String,
    status: (json['status'] ?? 'SUCCEEDED').toString(),
    amount: (json['amount'] ?? '0.00').toString(),
    reason: json['reason'] as String?,
    createdAt: json['created_at'] == null
        ? null
        : DateTime.parse(json['created_at'] as String).toUtc(),
  );
}
