import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/dashboard_repository.dart';
import '../data/local_dashboard_repository.dart';
import '../../reports/data/local_reports_repository.dart';
import '../data/online_dashboard_repository.dart';
import '../domain/dashboard_models.dart';

final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalDashboardRepository(
      reports: LocalReportsRepository(
        database: ref.watch(appDatabaseProvider),
        merchantId: auth!.merchantId!,
      ),
    );
  }
  return OnlineDashboardRepository(ref.watch(onlineAuthApiProvider));
});

class DashboardState {
  const DashboardState({required this.summary, required this.days});
  final SalesSummary summary;
  final List<SalesDay> days;
}

final dashboardControllerProvider =
    AsyncNotifierProvider<DashboardController, DashboardState>(
      DashboardController.new,
    );

class DashboardController extends AsyncNotifier<DashboardState> {
  @override
  Future<DashboardState> build() async {
    final configuration = ref.read(configurationProvider);
    final localAuth = ref.read(localAuthControllerProvider).asData?.value;
    final onlineWorkspace = configuration.isFullyOffline
        ? null
        : ref.watch(onlineWorkspaceControllerProvider).asData?.value;
    final shopId = configuration.isFullyOffline
        ? localAuth?.shopId
        : onlineWorkspace?.selectedShop.id;
    if (shopId == null) throw StateError('Workspace is not ready.');
    final now = DateTime.now().toUtc();
    final start = DateTime.utc(now.year, now.month, now.day);
    final repository = ref.read(dashboardRepositoryProvider);
    final results = await Future.wait([
      repository.salesSummary(from: start, to: now, shopId: shopId),
      repository.salesByDay(
        from: now.subtract(const Duration(days: 6)),
        to: now,
        shopId: shopId,
      ),
    ]);
    return DashboardState(
      summary: results[0] as SalesSummary,
      days: results[1] as List<SalesDay>,
    );
  }
}
