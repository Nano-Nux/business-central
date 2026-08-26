import '../../../features/auth/data/online_auth_api.dart';
import '../application/customers_repository.dart';
import '../domain/customer_history_models.dart';

class OnlineCustomersRepository implements CustomersRepository {
  OnlineCustomersRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<CustomerHistoryRow>> list({required String shopId}) async {
    final results = await Future.wait([
      api.getCollection('/invoices?page_index=0&page_size=500'),
      api.getCollection(
        '/repairs/orders?page_index=0&page_size=500&filter=shop_id:${Uri.encodeQueryComponent(shopId)}',
      ),
    ]);
    final rows = <String, _Counts>{};
    for (final item in results[0]) {
      if (item['shop_id'] == shopId) {
        _add(
          rows,
          name: item['customer'] as String? ?? '',
          phone: item['customer_phone'] as String? ?? '',
          sales: 1,
        );
      }
    }
    for (final item in results[1]) {
      if (item['shop_id'] == shopId) {
        _add(
          rows,
          name: item['customer_name'] as String? ?? '',
          phone: item['customer_phone'] as String? ?? '',
          repairs: 1,
        );
      }
    }
    return [
      for (final entry in rows.entries)
        if (entry.value.name.isNotEmpty &&
            entry.value.name.toLowerCase() != 'walk-in customer' &&
            entry.value.name.toLowerCase() != 'unknown')
          CustomerHistoryRow(
            name: entry.value.name,
            phone: entry.value.phone,
            sales: entry.value.sales,
            repairs: entry.value.repairs,
          ),
    ];
  }

  void _add(
    Map<String, _Counts> rows, {
    required String name,
    required String phone,
    int sales = 0,
    int repairs = 0,
  }) {
    final key = '${name.trim().toLowerCase()}|${phone.trim()}';
    final current = rows[key];
    if (current == null) {
      rows[key] = _Counts(name.trim(), phone.trim(), sales, repairs);
    } else {
      current.sales += sales;
      current.repairs += repairs;
    }
  }
}

class _Counts {
  _Counts(this.name, this.phone, this.sales, this.repairs);
  final String name;
  final String phone;
  int sales;
  int repairs;
}
