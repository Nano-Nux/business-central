class SalesSummary {
  const SalesSummary({
    required this.orderCount,
    required this.itemQuantity,
    required this.netSales,
    required this.grossProfit,
    required this.grossMarginPercent,
  });
  final int orderCount;
  final String itemQuantity;
  final String netSales;
  final String grossProfit;
  final String grossMarginPercent;

  factory SalesSummary.fromJson(Map<String, Object?> json) => SalesSummary(
    orderCount: (json['order_count'] as num?)?.toInt() ?? 0,
    itemQuantity: json['item_quantity'] as String? ?? '0',
    netSales: json['net_sales'] as String? ?? '0',
    grossProfit: json['gross_profit'] as String? ?? '0',
    grossMarginPercent: json['gross_margin_percent'] as String? ?? '0',
  );
}

class SalesDay {
  const SalesDay({required this.day, required this.netSales});
  final String day;
  final String netSales;

  factory SalesDay.fromJson(Map<String, Object?> json) => SalesDay(
    day: json['day'] as String,
    netSales: json['net_sales'] as String? ?? '0',
  );
}
