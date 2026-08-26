import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/customers_repository.dart';
import '../data/local_customers_repository.dart';
import '../data/online_customers_repository.dart';
import '../domain/customer_history_models.dart';

final customersRepositoryProvider = Provider<CustomersRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalCustomersRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
    );
  }
  return OnlineCustomersRepository(ref.watch(onlineAuthApiProvider));
});

final customersControllerProvider =
    AsyncNotifierProvider<CustomersController, List<CustomerHistoryRow>>(
      CustomersController.new,
    );

class CustomersController extends AsyncNotifier<List<CustomerHistoryRow>> {
  @override
  Future<List<CustomerHistoryRow>> build() async {
    final configuration = ref.read(configurationProvider);
    final localAuth = ref.read(localAuthControllerProvider).asData?.value;
    final onlineWorkspace = configuration.isFullyOffline
        ? null
        : ref.read(onlineWorkspaceControllerProvider).asData?.value;
    final shopId = configuration.isFullyOffline
        ? localAuth?.shopId
        : onlineWorkspace?.selectedShop.id;
    if (shopId == null) throw StateError('Workspace is not ready.');
    return ref.read(customersRepositoryProvider).list(shopId: shopId);
  }
}
