import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/invoices_repository.dart';
import '../data/local_invoices_repository.dart';
import '../data/online_invoices_repository.dart';
import '../domain/invoice_models.dart';

final invoicesRepositoryProvider = Provider<InvoicesRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalInvoicesRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
    );
  }
  return OnlineInvoicesRepository(ref.watch(onlineAuthApiProvider));
});

final invoicesControllerProvider =
    AsyncNotifierProvider<InvoicesController, List<InvoiceRecord>>(
      InvoicesController.new,
    );

class InvoicesController extends AsyncNotifier<List<InvoiceRecord>> {
  @override
  Future<List<InvoiceRecord>> build() async {
    final configuration = ref.read(configurationProvider);
    final localAuth = ref.read(localAuthControllerProvider).asData?.value;
    final onlineWorkspace = configuration.isFullyOffline
        ? null
        : ref.read(onlineWorkspaceControllerProvider).asData?.value;
    final shopId = configuration.isFullyOffline
        ? localAuth?.shopId
        : onlineWorkspace?.selectedShop.id;
    if (shopId == null) throw StateError('Workspace is not ready.');
    return ref.read(invoicesRepositoryProvider).list(shopId: shopId);
  }
}
