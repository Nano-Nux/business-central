import '../domain/customer_history_models.dart';

abstract interface class CustomersRepository {
  Future<List<CustomerHistoryRow>> list({required String shopId});
}
