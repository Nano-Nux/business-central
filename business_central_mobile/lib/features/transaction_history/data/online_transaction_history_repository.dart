import '../../../features/auth/data/online_auth_api.dart';
import '../application/transaction_history_repository.dart';
import '../domain/transaction_history_models.dart';

class OnlineTransactionHistoryRepository
    implements TransactionHistoryRepository {
  OnlineTransactionHistoryRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<TransactionHistoryEntry>> list({
    required String shopId,
    String? query,
    String? eventType,
    DateTime? from,
    DateTime? to,
  }) async {
    final filters = <String>['shop_id:$shopId'];
    if (eventType != null && eventType.isNotEmpty) {
      filters.add('event_type:$eventType');
    }
    if (from != null) filters.add('from:${from.toUtc().toIso8601String()}');
    if (to != null) filters.add('to:${to.toUtc().toIso8601String()}');
    final params = <String, String>{
      'page_index': '0',
      'page_size': '50',
      'filter': filters.join(','),
      if (query != null && query.trim().isNotEmpty) 'query': query.trim(),
    };
    final path = Uri(path: '/transaction-history', queryParameters: params);
    return [
      for (final item in await api.getCollection(path.toString()))
        TransactionHistoryEntry.fromJson(item),
    ];
  }

  @override
  Future<TransactionHistoryDetail> detail(String id) async {
    return TransactionHistoryDetail.fromJson(
      await api.getResource('/transaction-history/${Uri.encodeComponent(id)}'),
    );
  }
}
