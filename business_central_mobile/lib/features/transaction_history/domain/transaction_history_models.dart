class TransactionHistoryEntry {
  const TransactionHistoryEntry({
    required this.id,
    required this.eventType,
    required this.reference,
    required this.occurredAt,
    required this.status,
    this.channel,
    this.customerName,
    this.customerPhone,
    this.paymentMethod,
    this.amount,
    this.currencyCode,
    this.shopId,
    this.shopName,
    this.quantity,
    this.productName,
    this.variantName,
    this.sku,
    this.details,
  });

  final String id;
  final String eventType;
  final String reference;
  final DateTime occurredAt;
  final String status;
  final String? channel;
  final String? customerName;
  final String? customerPhone;
  final String? paymentMethod;
  final String? amount;
  final String? currencyCode;
  final String? shopId;
  final String? shopName;
  final String? quantity;
  final String? productName;
  final String? variantName;
  final String? sku;
  final String? details;

  factory TransactionHistoryEntry.fromJson(Map<String, Object?> json) =>
      TransactionHistoryEntry(
        id: json['id'] as String,
        eventType: json['event_type'] as String,
        reference: json['reference'] as String,
        occurredAt: DateTime.parse(json['occurred_at'] as String).toUtc(),
        status: json['status'] as String? ?? 'UNKNOWN',
        channel: json['channel'] as String?,
        customerName: json['customer_name'] as String?,
        customerPhone: json['customer_phone'] as String?,
        paymentMethod: json['payment_method'] as String?,
        amount: json['amount']?.toString(),
        currencyCode: json['currency_code'] as String?,
        shopId: json['shop_id'] as String?,
        shopName: json['shop_name'] as String?,
        quantity: json['quantity']?.toString(),
        productName: json['product_name'] as String?,
        variantName: json['variant_name'] as String?,
        sku: json['sku'] as String?,
        details: json['details'] as String?,
      );
}

class TransactionHistoryLine {
  const TransactionHistoryLine({
    required this.description,
    required this.quantity,
    required this.unitPrice,
    required this.originalCost,
    required this.lineTotal,
    required this.grossProfit,
    this.productName,
    this.variantName,
    this.sku,
  });

  final String description;
  final String quantity;
  final String unitPrice;
  final String originalCost;
  final String lineTotal;
  final String grossProfit;
  final String? productName;
  final String? variantName;
  final String? sku;

  factory TransactionHistoryLine.fromJson(Map<String, Object?> json) =>
      TransactionHistoryLine(
        description: json['description'] as String? ?? '',
        quantity: (json['quantity'] ?? '0').toString(),
        unitPrice: (json['unit_price'] ?? '0').toString(),
        originalCost: (json['original_cost'] ?? '0').toString(),
        lineTotal: (json['line_total'] ?? '0').toString(),
        grossProfit: (json['gross_profit'] ?? '0').toString(),
        productName: json['product_name'] as String?,
        variantName: json['variant_name'] as String?,
        sku: json['sku'] as String?,
      );
}

class TransactionPayment {
  const TransactionPayment({
    required this.method,
    required this.status,
    required this.amount,
    this.id,
  });
  final String? id;
  final String method;
  final String status;
  final String amount;

  factory TransactionPayment.fromJson(Map<String, Object?> json) =>
      TransactionPayment(
        id: json['id'] as String?,
        method: json['method'] as String? ?? '',
        status: json['status'] as String? ?? '',
        amount: (json['amount'] ?? '0').toString(),
      );
}

class TransactionHistoryDetail {
  const TransactionHistoryDetail({
    required this.entry,
    required this.lines,
    required this.payments,
    required this.refunds,
    required this.totalCost,
    required this.grossProfit,
    required this.grossMargin,
    this.order,
  });

  final TransactionHistoryEntry entry;
  final Map<String, Object?>? order;
  final List<TransactionHistoryLine> lines;
  final List<TransactionPayment> payments;
  final List<Map<String, Object?>> refunds;
  final String totalCost;
  final String grossProfit;
  final String grossMargin;

  factory TransactionHistoryDetail.fromJson(Map<String, Object?> json) =>
      TransactionHistoryDetail(
        entry: TransactionHistoryEntry.fromJson(
          json['entry']! as Map<String, Object?>,
        ),
        order: json['order'] as Map<String, Object?>?,
        lines: [
          for (final item in (json['lines'] as List<Object?>? ?? const []))
            TransactionHistoryLine.fromJson(item! as Map<String, Object?>),
        ],
        payments: [
          for (final item in (json['payments'] as List<Object?>? ?? const []))
            TransactionPayment.fromJson(item! as Map<String, Object?>),
        ],
        refunds: [
          for (final item in (json['refunds'] as List<Object?>? ?? const []))
            item! as Map<String, Object?>,
        ],
        totalCost: (json['total_cost'] ?? '0').toString(),
        grossProfit: (json['gross_profit'] ?? '0').toString(),
        grossMargin: (json['gross_margin'] ?? '0').toString(),
      );
}
