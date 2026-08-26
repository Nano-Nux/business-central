import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/reports_repository.dart';
import '../data/local_reports_repository.dart';
import '../data/online_reports_repository.dart';
import '../domain/report_models.dart';

final reportsRepositoryProvider = Provider<ReportsRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalReportsRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
    );
  }
  return OnlineReportsRepository(ref.watch(onlineAuthApiProvider));
});

final reportsControllerProvider =
    AsyncNotifierProvider<ReportsController, ReportsSnapshot>(
      ReportsController.new,
    );

class ReportsController extends AsyncNotifier<ReportsSnapshot> {
  int _rangeDays = 7;

  @override
  Future<ReportsSnapshot> build() => _load(_rangeDays);

  Future<void> setRange(int days) async {
    _rangeDays = days;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _load(days));
  }

  Future<ReportsSnapshot> _load(int days) async {
    final configuration = ref.read(configurationProvider);
    final localAuth = ref.read(localAuthControllerProvider).asData?.value;
    final onlineWorkspace = configuration.isFullyOffline
        ? null
        : ref.read(onlineWorkspaceControllerProvider).asData?.value;
    final shopId = configuration.isFullyOffline
        ? localAuth?.shopId
        : onlineWorkspace?.selectedShop.id;
    if (shopId == null) throw StateError('Workspace is not ready.');
    final to = DateTime.now().toUtc();
    final from = days == 1
        ? DateTime.utc(to.year, to.month, to.day)
        : to.subtract(Duration(days: days));
    return ref
        .read(reportsRepositoryProvider)
        .load(shopId: shopId, from: from, to: to);
  }
}
