import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/inventory_repository.dart';
import '../data/inventory_cache_repository.dart';
import '../data/local_inventory_repository.dart';
import '../data/online_inventory_repository.dart';
import '../domain/inventory_models.dart';

final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalInventoryRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
      actorMembershipId: auth.membershipId,
    );
  }
  return OnlineInventoryRepository(
    ref.watch(onlineAuthApiProvider),
    InventoryCacheRepository(ref.watch(appDatabaseProvider)),
  );
});

final inventoryControllerProvider =
    AsyncNotifierProvider<InventoryController, List<InventoryLocation>>(
      InventoryController.new,
    );

class InventoryController extends AsyncNotifier<List<InventoryLocation>> {
  @override
  Future<List<InventoryLocation>> build() async {
    final configuration = ref.read(configurationProvider);
    final localAuth = ref.read(localAuthControllerProvider).asData?.value;
    final onlineWorkspace = configuration.isFullyOffline
        ? null
        : ref.read(onlineWorkspaceControllerProvider).asData?.value;
    final merchantId = configuration.isFullyOffline
        ? localAuth?.merchantId
        : onlineWorkspace?.merchant.id;
    final shopId = configuration.isFullyOffline
        ? localAuth?.shopId
        : onlineWorkspace?.selectedShop.id;
    if (merchantId == null || shopId == null) {
      throw StateError('Workspace is not ready.');
    }
    return ref
        .read(inventoryRepositoryProvider)
        .locations(merchantId: merchantId, shopId: shopId);
  }

  Future<void> stockIn({
    required String variantId,
    required String destinationLocationId,
    required String quantity,
    required String unitCost,
    String? purchaseOrderId,
    String? purchaseOrderLineId,
    String? unitId,
    String? receiptNumber,
    String? batchNumber,
    String? expiresAt,
    String? eventKey,
  }) async {
    final current = state.asData?.value;
    if (current == null) throw StateError('Inventory is not ready.');
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref
          .read(inventoryRepositoryProvider)
          .stockIn(
            variantId: variantId,
            destinationLocationId: destinationLocationId,
            quantity: quantity,
            unitCost: unitCost,
            purchaseOrderId: purchaseOrderId,
            purchaseOrderLineId: purchaseOrderLineId,
            unitId: unitId,
            receiptNumber: receiptNumber,
            batchNumber: batchNumber,
            expiresAt: expiresAt,
            eventKey: eventKey,
          );
      return current;
    });
  }

  Future<List<InventoryMovement>> movements() async {
    final current = state.asData?.value;
    if (current == null) throw StateError('Inventory is not ready.');
    return ref
        .read(inventoryRepositoryProvider)
        .movements(locationIds: {for (final location in current) location.id});
  }

  Future<InventoryMovementDetail> movementDetail({required String id}) {
    return ref.read(inventoryRepositoryProvider).movementDetail(id: id);
  }
}
