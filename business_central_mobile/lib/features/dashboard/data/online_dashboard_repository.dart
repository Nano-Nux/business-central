import '../../../features/auth/data/online_auth_api.dart';
import '../application/dashboard_repository.dart';
import '../domain/dashboard_models.dart';

class OnlineDashboardRepository implements DashboardRepository {
  OnlineDashboardRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<SalesSummary> salesSummary({
    required DateTime from,
    required DateTime to,
    required String shopId,
  }) async {
    final data = await api.getResource(
      _path('/reports/sales-summary', from, to, shopId),
    );
    return SalesSummary.fromJson(data);
  }

  @override
  Future<List<SalesDay>> salesByDay({
    required DateTime from,
    required DateTime to,
    required String shopId,
  }) async {
    final data = await api.getCollection(
      '${_path('/reports/sales-by-day', from, to, shopId)}&page_index=0&page_size=7',
    );
    return [for (final item in data) SalesDay.fromJson(item)];
  }

  String _path(String endpoint, DateTime from, DateTime to, String shopId) =>
      '$endpoint?from=${Uri.encodeQueryComponent(from.toUtc().toIso8601String())}&to=${Uri.encodeQueryComponent(to.toUtc().toIso8601String())}&shop_id=${Uri.encodeQueryComponent(shopId)}';
}
