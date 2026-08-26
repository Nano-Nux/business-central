class ReportSummary {
  const ReportSummary({
    required this.orderCount,
    required this.posOrderCount,
    required this.repairCount,
    required this.itemQuantity,
    required this.grossSales,
    required this.discounts,
    required this.netSales,
    required this.refunds,
    required this.costOfGoodsSold,
    required this.grossProfit,
    required this.grossMarginPercent,
  });

  final int orderCount;
  final int posOrderCount;
  final int repairCount;
  final String itemQuantity;
  final String grossSales;
  final String discounts;
  final String netSales;
  final String refunds;
  final String costOfGoodsSold;
  final String grossProfit;
  final String grossMarginPercent;

  factory ReportSummary.fromJson(Map<String, Object?> json) => ReportSummary(
    orderCount: (json['order_count'] as num?)?.toInt() ?? 0,
    posOrderCount: (json['pos_order_count'] as num?)?.toInt() ?? 0,
    repairCount: (json['repair_count'] as num?)?.toInt() ?? 0,
    itemQuantity: (json['item_quantity'] ?? '0').toString(),
    grossSales: (json['gross_sales'] ?? '0').toString(),
    discounts: (json['discounts'] ?? '0').toString(),
    netSales: (json['net_sales'] ?? '0').toString(),
    refunds: (json['refunds'] ?? '0').toString(),
    costOfGoodsSold: (json['cost_of_goods_sold'] ?? '0').toString(),
    grossProfit: (json['gross_profit'] ?? '0').toString(),
    grossMarginPercent: (json['gross_margin_percent'] ?? '0').toString(),
  );
}

class ReportDay {
  const ReportDay({
    required this.day,
    required this.orderCount,
    required this.itemQuantity,
    required this.netSales,
    required this.refunds,
    required this.costOfGoodsSold,
    required this.grossProfit,
  });

  final DateTime day;
  final int orderCount;
  final String itemQuantity;
  final String netSales;
  final String refunds;
  final String costOfGoodsSold;
  final String grossProfit;

  factory ReportDay.fromJson(Map<String, Object?> json) => ReportDay(
    day: DateTime.parse(json['day'] as String).toUtc(),
    orderCount: (json['order_count'] as num?)?.toInt() ?? 0,
    itemQuantity: (json['item_quantity'] ?? '0').toString(),
    netSales: (json['net_sales'] ?? '0').toString(),
    refunds: (json['refunds'] ?? '0').toString(),
    costOfGoodsSold: (json['cost_of_goods_sold'] ?? '0').toString(),
    grossProfit: (json['gross_profit'] ?? '0').toString(),
  );
}

class TopProductReport {
  const TopProductReport({
    required this.productName,
    required this.variantName,
    required this.sku,
    required this.itemQuantity,
    required this.netSales,
    required this.costOfGoodsSold,
    required this.grossProfit,
  });

  final String productName;
  final String variantName;
  final String sku;
  final String itemQuantity;
  final String netSales;
  final String costOfGoodsSold;
  final String grossProfit;

  factory TopProductReport.fromJson(Map<String, Object?> json) =>
      TopProductReport(
        productName: json['product_name'] as String? ?? '',
        variantName: json['variant_name'] as String? ?? '',
        sku: json['sku'] as String? ?? '',
        itemQuantity: (json['item_quantity'] ?? '0').toString(),
        netSales: (json['net_sales'] ?? '0').toString(),
        costOfGoodsSold: (json['cost_of_goods_sold'] ?? '0').toString(),
        grossProfit: (json['gross_profit'] ?? '0').toString(),
      );
}

class ReportsSnapshot {
  const ReportsSnapshot({
    required this.summary,
    required this.days,
    required this.topProducts,
    required this.from,
    required this.to,
  });

  final ReportSummary summary;
  final List<ReportDay> days;
  final List<TopProductReport> topProducts;
  final DateTime from;
  final DateTime to;
}
