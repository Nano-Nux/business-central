import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/sync/sync_api.dart';
import '../../../core/sync/sync_models.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../core/sync/sync_worker.dart';
import '../../auth/presentation/online_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';

class SyncQueueSummary {
  const SyncQueueSummary({
    required this.pending,
    required this.failed,
    required this.conflicts,
  });

  final int pending;
  final int failed;
  final int conflicts;
}

final syncQueueWriterProvider = Provider<SyncQueueWriter>((ref) {
  return SyncQueueWriter(database: ref.watch(appDatabaseProvider));
});

final syncQueueSummaryProvider =
    StreamProvider.family<SyncQueueSummary, String>(
      (ref, merchantId) => ref
          .watch(appDatabaseProvider)
          .watchOperationQueue(merchantId)
          .map(
            (rows) => SyncQueueSummary(
              pending: rows.where((row) => row.status == 'PENDING').length,
              failed: rows
                  .where(
                    (row) => row.status == 'FAILED' || row.status == 'REJECTED',
                  )
                  .length,
              conflicts: rows.where((row) => row.status == 'CONFLICT').length,
            ),
          ),
    );

final syncWorkerProvider = Provider<SyncWorker>((ref) {
  final configuration = ref.watch(configurationProvider);
  if (configuration.isFullyOffline) return const FullyOfflineSyncWorker();

  final worker = OnlineSyncWorker(
    database: ref.watch(appDatabaseProvider),
    api: SyncApi(ref.watch(onlineAuthApiProvider)),
    queue: ref.watch(syncQueueWriterProvider),
  );

  void schedule() {
    final session = ref.read(onlineAuthControllerProvider).asData?.value;
    final workspace = ref.read(onlineWorkspaceControllerProvider).asData?.value;
    final connected = ref.read(connectivityProvider).asData?.value ?? false;
    if (!connected || session == null || workspace == null) return;
    unawaited(
      worker.synchronize(
        SyncContext(
          merchantId: workspace.merchant.id,
          membershipId: session.user.membershipId,
          shopId: workspace.selectedShop.id,
        ),
      ),
    );
  }

  ref.listen(connectivityProvider, (_, next) {
    next.whenData((connected) {
      if (connected) schedule();
    });
  });
  ref.listen(onlineAuthControllerProvider, (_, _) => schedule());
  ref.listen(onlineWorkspaceControllerProvider, (_, _) => schedule());
  schedule();
  return worker;
});
