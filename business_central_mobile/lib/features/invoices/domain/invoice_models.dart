class InvoiceLine {
  const InvoiceLine({
    required this.name,
    required this.quantity,
    required this.unitPrice,
  });
  final String name;
  final String quantity;
  final String unitPrice;

  factory InvoiceLine.fromJson(Map<String, Object?> json) => InvoiceLine(
    name: json['name'] as String? ?? '',
    quantity: (json['quantity'] ?? '0').toString(),
    unitPrice: (json['unit_price'] ?? '0').toString(),
  );
}

class InvoiceRecord {
  const InvoiceRecord({
    required this.id,
    required this.number,
    required this.customer,
    required this.merchantName,
    required this.currencyCode,
    required this.createdAt,
    required this.status,
    this.kind = 'pos',
    required this.subtotal,
    required this.discountTotal,
    required this.taxTotal,
    required this.grandTotal,
    required this.items,
    this.customerPhone,
    this.shopId,
    this.shopName,
    this.shopLogoUrl,
    this.showShopLogo = true,
    this.deliveryName,
    this.deliveryFee,
    this.deliveryContact,
    this.note,
    this.paymentType,
    this.taxLabel,
    this.receiptNote,
    this.footerNote,
  });

  final String id;
  final String number;
  final String customer;
  final String? customerPhone;
  final String merchantName;
  final String? shopId;
  final String? shopName;
  final String? shopLogoUrl;
  final bool showShopLogo;
  final String currencyCode;
  final DateTime createdAt;
  final String status;
  final String kind;
  final String subtotal;
  final String discountTotal;
  final String taxTotal;
  final String grandTotal;
  final String? deliveryName;
  final String? deliveryFee;
  final String? deliveryContact;
  final String? note;
  final String? paymentType;
  final String? taxLabel;
  final String? receiptNote;
  final String? footerNote;
  final List<InvoiceLine> items;

  factory InvoiceRecord.fromJson(Map<String, Object?> json) => InvoiceRecord(
    id: json['id'] as String,
    number: json['number'] as String,
    customer: json['customer'] as String? ?? 'Walk-in customer',
    customerPhone: json['customer_phone'] as String?,
    merchantName: json['merchant_name'] as String? ?? '',
    shopId: json['shop_id'] as String?,
    shopName: json['shop_name'] as String?,
    shopLogoUrl: json['shop_logo_url'] as String?,
    showShopLogo: json['show_shop_logo'] as bool? ?? true,
    currencyCode: json['currency_code'] as String? ?? 'USD',
    createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
    status: json['status'] as String? ?? 'UNKNOWN',
    kind: json['kind'] as String? ?? 'pos',
    subtotal: (json['subtotal'] ?? '0').toString(),
    discountTotal: (json['discount_total'] ?? '0').toString(),
    taxTotal: (json['tax_total'] ?? '0').toString(),
    grandTotal: (json['grand_total'] ?? '0').toString(),
    deliveryName: json['delivery_name'] as String?,
    deliveryFee: json['delivery_fee']?.toString(),
    deliveryContact: json['delivery_contact'] as String?,
    note: json['note'] as String?,
    paymentType: json['payment_type'] as String?,
    taxLabel: json['tax_label'] as String?,
    receiptNote: json['receipt_note'] as String?,
    footerNote: json['footer_note'] as String?,
    items: [
      for (final item in (json['items'] as List<Object?>? ?? const []))
        InvoiceLine.fromJson(item! as Map<String, Object?>),
      if ((json['kind'] as String? ?? '') == 'repair')
        ..._repairWorkItemLines(json),
    ],
  );

  static List<InvoiceLine> _repairWorkItemLines(Map<String, Object?> json) => [
    for (final raw in json['work_items'] as List<Object?>? ?? const [])
      if (raw is Map<String, Object?>)
        InvoiceLine(
          name: _repairWorkItemLabel(raw),
          quantity: '1',
          unitPrice: '0.00',
        ),
  ];

  static String _repairWorkItemLabel(Map<String, Object?> item) {
    final device = item['device'] as Map<String, Object?>? ?? item;
    final issues = [
      for (final value in item['issues'] as List<Object?>? ?? const [])
        if (value.toString().trim().isNotEmpty) value.toString().trim(),
    ];
    if (issues.isEmpty &&
        item['issue_description']?.toString().trim().isNotEmpty == true) {
      issues.add(item['issue_description'].toString().trim());
    }
    final conditions = [
      for (final value in item['conditions'] as List<Object?>? ?? const [])
        if (value.toString().trim().isNotEmpty) value.toString().trim(),
    ];
    return [
      [device['device_type'], device['manufacturer'], device['model']]
          .where((value) => value?.toString().trim().isNotEmpty == true)
          .join(' · '),
      for (final issue in issues) 'Issue: $issue',
      for (final condition in conditions) 'Condition: $condition',
    ].where((value) => value.isNotEmpty).join(' · ');
  }
}
