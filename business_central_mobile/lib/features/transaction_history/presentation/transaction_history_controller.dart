import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/transaction_history_repository.dart';
import '../data/local_transaction_history_repository.dart';
import '../data/online_transaction_history_repository.dart';
import '../domain/transaction_history_models.dart';
import '../../pos/domain/pos_models.dart';
import '../../pos/presentation/pos_controller.dart';

final transactionHistoryRepositoryProvider =
    Provider<TransactionHistoryRepository>((ref) {
      if (ref.watch(configurationProvider).isFullyOffline) {
        final auth = ref.watch(localAuthControllerProvider).asData?.value;
        if (auth?.merchantId == null) {
          throw StateError('Local workspace is not authenticated.');
        }
        return LocalTransactionHistoryRepository(
          database: ref.watch(appDatabaseProvider),
          merchantId: auth!.merchantId!,
        );
      }
      return OnlineTransactionHistoryRepository(
        ref.watch(onlineAuthApiProvider),
      );
    });

final transactionHistoryControllerProvider =
    AsyncNotifierProvider<
      TransactionHistoryController,
      List<TransactionHistoryEntry>
    >(TransactionHistoryController.new);

class TransactionHistoryController
    extends AsyncNotifier<List<TransactionHistoryEntry>> {
  @override
  Future<List<TransactionHistoryEntry>> build() => _load();

  Future<void> load({
    String query = '',
    String eventType = '',
    int rangeDays = 30,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => _load(query: query, eventType: eventType, rangeDays: rangeDays),
    );
  }

  Future<TransactionHistoryDetail> detail(String id) {
    return ref.read(transactionHistoryRepositoryProvider).detail(id);
  }

  Future<PosRefund> refund({
    required String orderId,
    required String paymentId,
    required String amount,
    String? reason,
  }) {
    return ref
        .read(posRepositoryProvider)
        .refund(
          orderId: orderId,
          paymentId: paymentId,
          amount: amount,
          reason: reason,
        );
  }

  Future<List<TransactionHistoryEntry>> _load({
    String query = '',
    String eventType = '',
    int rangeDays = 30,
  }) async {
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
    final from = rangeDays == 0
        ? null
        : rangeDays == 1
        ? DateTime.utc(to.year, to.month, to.day)
        : to.subtract(Duration(days: rangeDays));
    return ref
        .read(transactionHistoryRepositoryProvider)
        .list(
          shopId: shopId,
          query: query,
          eventType: eventType,
          from: from,
          to: from == null ? null : to,
        );
  }
}
