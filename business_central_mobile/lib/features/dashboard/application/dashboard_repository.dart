import '../domain/dashboard_models.dart';

abstract interface class DashboardRepository {
  Future<SalesSummary> salesSummary({
    required DateTime from,
    required DateTime to,
    required String shopId,
  });
  Future<List<SalesDay>> salesByDay({
    required DateTime from,
    required DateTime to,
    required String shopId,
  });
}
