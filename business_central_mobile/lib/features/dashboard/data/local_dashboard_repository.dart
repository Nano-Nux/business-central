import '../application/dashboard_repository.dart';
import '../domain/dashboard_models.dart';
import '../../reports/data/local_reports_repository.dart';

class LocalDashboardRepository implements DashboardRepository {
  LocalDashboardRepository({required this._reports});

  final LocalReportsRepository _reports;

  @override
  Future<SalesSummary> salesSummary({
    required DateTime from,
    required DateTime to,
    required String shopId,
  }) async {
    final snapshot = await _reports.load(shopId: shopId, from: from, to: to);
    return SalesSummary(
      orderCount: snapshot.summary.orderCount,
      itemQuantity: snapshot.summary.itemQuantity,
      netSales: snapshot.summary.netSales,
      grossProfit: snapshot.summary.grossProfit,
      grossMarginPercent: snapshot.summary.grossMarginPercent,
    );
  }

  @override
  Future<List<SalesDay>> salesByDay({
    required DateTime from,
    required DateTime to,
    required String shopId,
  }) async {
    final snapshot = await _reports.load(shopId: shopId, from: from, to: to);
    return [
      for (final day in snapshot.days)
        SalesDay(day: day.day.toIso8601String(), netSales: day.netSales),
    ];
  }
}
