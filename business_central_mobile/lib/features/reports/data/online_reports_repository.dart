import '../../../features/auth/data/online_auth_api.dart';
import '../application/reports_repository.dart';
import '../domain/report_models.dart';

class OnlineReportsRepository implements ReportsRepository {
  OnlineReportsRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<ReportsSnapshot> load({
    required String shopId,
    required DateTime from,
    required DateTime to,
  }) async {
    final query = _query(shopId: shopId, from: from, to: to);
    final results = await Future.wait([
      api.getResource('/reports/sales-summary$query'),
      api.getCollection(
        '/reports/sales-by-day$query&page_index=0&page_size=100',
      ),
      api.getCollection('/reports/top-products$query&page_index=0&page_size=5'),
    ]);
    return ReportsSnapshot(
      summary: ReportSummary.fromJson(results[0] as Map<String, Object?>),
      days: [
        for (final item in results[1] as List<Map<String, Object?>>)
          ReportDay.fromJson(item),
      ],
      topProducts: [
        for (final item in results[2] as List<Map<String, Object?>>)
          TopProductReport.fromJson(item),
      ],
      from: from,
      to: to,
    );
  }

  String _query({
    required String shopId,
    required DateTime from,
    required DateTime to,
  }) =>
      '?from=${Uri.encodeQueryComponent(from.toUtc().toIso8601String())}'
      '&to=${Uri.encodeQueryComponent(to.toUtc().toIso8601String())}'
      '&shop_id=${Uri.encodeQueryComponent(shopId)}';
}
