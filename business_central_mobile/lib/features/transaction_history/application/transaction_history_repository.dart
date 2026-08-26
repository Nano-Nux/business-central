import '../domain/transaction_history_models.dart';

abstract interface class TransactionHistoryRepository {
  Future<List<TransactionHistoryEntry>> list({
    required String shopId,
    String? query,
    String? eventType,
    DateTime? from,
    DateTime? to,
  });

  Future<TransactionHistoryDetail> detail(String id);
}
