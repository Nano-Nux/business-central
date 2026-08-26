import 'package:drift/drift.dart';

import '../../../core/database/app_database.dart';
import '../application/customers_repository.dart';
import '../domain/customer_history_models.dart';

class LocalCustomersRepository implements CustomersRepository {
  LocalCustomersRepository({required this.database, required this.merchantId});

  final AppDatabase database;
  final String merchantId;

  @override
  Future<List<CustomerHistoryRow>> list({required String shopId}) async {
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null) {
      throw StateError('Customer scope is outside the active merchant.');
    }
    final orders =
        await (database.select(database.localOrders)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.shopId.equals(shopId),
            ))
            .get();
    final rows = <String, _LocalCounts>{};
    for (final order in orders) {
      final name = order.customerName?.trim() ?? '';
      final phone = order.customerPhone?.trim() ?? '';
      final key = '${name.toLowerCase()}|$phone';
      if (name.isEmpty || name.toLowerCase() == 'walk-in customer') continue;
      final current = rows[key];
      if (current == null) {
        rows[key] = _LocalCounts(name, phone, sales: 1);
      } else {
        current.sales++;
      }
    }
    final repairs =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId) &
                  row.recordType.equals('REPAIR'),
            ))
            .get();
    for (final repair in repairs) {
      final name = repair.customerName?.trim() ?? '';
      final phone = repair.customerPhone?.trim() ?? '';
      if (name.isEmpty || name.toLowerCase() == 'walk-in customer') continue;
      final key = '${name.toLowerCase()}|$phone';
      final current = rows[key];
      if (current == null) {
        rows[key] = _LocalCounts(name, phone, repairs: 1);
      } else {
        current.repairs++;
      }
    }
    return [
      for (final row in rows.values)
        CustomerHistoryRow(
          name: row.name,
          phone: row.phone,
          sales: row.sales,
          repairs: row.repairs,
        ),
    ];
  }
}

class _LocalCounts {
  _LocalCounts(this.name, this.phone, {this.sales = 0, this.repairs = 0});
  final String name;
  final String phone;
  int sales;
  int repairs;
}
