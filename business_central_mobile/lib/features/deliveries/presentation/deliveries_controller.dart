import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../data/local_deliveries_repository.dart';
import '../application/deliveries_repository.dart';
import '../data/online_deliveries_repository.dart';
import '../domain/delivery_models.dart';

final deliveriesRepositoryProvider = Provider<DeliveriesRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not ready.');
    }
    return LocalDeliveriesRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
      shopId: auth.shopId!,
    );
  }
  return OnlineDeliveriesRepository(ref.watch(onlineAuthApiProvider));
});

final deliveriesControllerProvider =
    AsyncNotifierProvider<DeliveriesController, List<DeliveryOption>>(
      DeliveriesController.new,
    );

class DeliveriesController extends AsyncNotifier<List<DeliveryOption>> {
  @override
  Future<List<DeliveryOption>> build() => _load();

  Future<void> create({
    required String name,
    required String contactInfo,
  }) async {
    final scope = _scope();
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref
          .read(deliveriesRepositoryProvider)
          .create(
            merchantId: scope.$1,
            shopId: scope.$2,
            name: name,
            contactInfo: contactInfo,
          );
      return _load();
    });
  }

  Future<void> remove(String id) async {
    final current = state.asData?.value;
    if (current == null) return;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(deliveriesRepositoryProvider).delete(id);
      return [
        for (final item in current)
          if (item.id != id) item,
      ];
    });
  }

  Future<List<DeliveryOption>> _load() async {
    final scope = _scope();
    return ref
        .read(deliveriesRepositoryProvider)
        .list(merchantId: scope.$1, shopId: scope.$2);
  }

  (String, String) _scope() {
    if (ref.read(configurationProvider).isFullyOffline) {
      final auth = ref.read(localAuthControllerProvider).asData?.value;
      if (auth?.merchantId == null || auth?.shopId == null) {
        throw StateError('Local workspace is not ready.');
      }
      return (auth!.merchantId!, auth.shopId!);
    }
    final workspace = ref.read(onlineWorkspaceControllerProvider).asData?.value;
    if (workspace == null) throw StateError('Workspace is not ready.');
    return (workspace.merchant.id, workspace.selectedShop.id);
  }
}
