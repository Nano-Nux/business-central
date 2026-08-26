import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/sync/sync_queue.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/online_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/repairs_repository.dart';
import '../data/local_repairs_repository.dart';
import '../data/online_repairs_repository.dart';
import '../domain/repair_models.dart';

final repairsRepositoryProvider = Provider<RepairsRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalRepairsRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
      actorMembershipId: auth.membershipId,
    );
  }
  final session = ref.watch(onlineAuthControllerProvider).asData?.value;
  return OnlineRepairsRepository(
    ref.watch(onlineAuthApiProvider),
    database: ref.watch(appDatabaseProvider),
    merchantId: session?.user.merchantId,
    actorMembershipId: session?.user.membershipId,
    queue: SyncQueueWriter(database: ref.watch(appDatabaseProvider)),
  );
});

final repairsControllerProvider =
    AsyncNotifierProvider<RepairsController, List<RepairRecord>>(
      RepairsController.new,
    );

class RepairsController extends AsyncNotifier<List<RepairRecord>> {
  @override
  Future<List<RepairRecord>> build() => _load();

  Future<void> createTicket({
    required String orderNumber,
    required String deviceType,
    required String issueDescription,
    String? manufacturer,
    String? model,
    String? serialNumber,
    String? priority,
    String? customerName,
    String? customerPhone,
    String? additionalFee,
    String? note,
    List<RepairWorkItemInput>? workItems,
    Map<String, Object?>? ticketFields,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref
          .read(repairsRepositoryProvider)
          .createTicket(
            shopId: _shopId(),
            orderNumber: orderNumber,
            deviceType: deviceType,
            issueDescription: issueDescription,
            manufacturer: manufacturer,
            model: model,
            serialNumber: serialNumber,
            priority: priority,
            customerName: customerName,
            customerPhone: customerPhone,
            additionalFee: additionalFee,
            note: note,
            workItems: workItems,
            ticketFields: ticketFields,
          );
      return _load();
    });
  }

  Future<void> addDiagnostic({
    required String repairOrderId,
    required String diagnosis,
    String? estimatedCost,
    String? workItemId,
  }) async {
    await ref
        .read(repairsRepositoryProvider)
        .createDiagnostic(
          repairOrderId: repairOrderId,
          diagnosis: diagnosis,
          estimatedCost: estimatedCost,
          workItemId: workItemId,
        );
  }

  Future<void> recordPayment({
    required String repairOrderId,
    required String kind,
    required String method,
    required String amount,
  }) async {
    await ref
        .read(repairsRepositoryProvider)
        .createPayment(
          repairOrderId: repairOrderId,
          kind: kind,
          method: method,
          amount: amount,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> recordRefund({
    required String repairOrderId,
    required String paymentId,
    required String amount,
    String? reason,
  }) async {
    await ref
        .read(repairsRepositoryProvider)
        .createRefund(
          repairOrderId: repairOrderId,
          paymentId: paymentId,
          amount: amount,
          reason: reason,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> updateStatus({
    required RepairRecord repair,
    required String status,
  }) async {
    await ref
        .read(repairsRepositoryProvider)
        .updateStatus(repair: repair, status: status);
    state = await AsyncValue.guard(_load);
  }

  Future<List<RepairRecord>> _load() async {
    return ref.read(repairsRepositoryProvider).list(shopId: _shopId());
  }

  String _shopId() {
    if (ref.read(configurationProvider).isFullyOffline) {
      final shopId = ref.read(localAuthControllerProvider).asData?.value.shopId;
      if (shopId == null) throw StateError('Local workspace is not ready.');
      return shopId;
    }
    final shopId = ref
        .read(onlineWorkspaceControllerProvider)
        .asData
        ?.value
        ?.selectedShop
        .id;
    if (shopId == null) throw StateError('Workspace is not ready.');
    return shopId;
  }
}

final repairFormDefinitionsProvider = FutureProvider.autoDispose
    .family<List<RepairFormField>, String>((ref, shopId) async {
      return ref
          .watch(repairsRepositoryProvider)
          .listFormDefinitions(shopId: shopId);
    });
