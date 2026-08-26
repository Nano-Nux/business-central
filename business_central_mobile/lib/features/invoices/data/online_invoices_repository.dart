import '../../../features/auth/data/online_auth_api.dart';
import '../application/invoices_repository.dart';
import '../domain/invoice_models.dart';

class OnlineInvoicesRepository implements InvoicesRepository {
  OnlineInvoicesRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<InvoiceRecord>> list({required String shopId}) async => [
    for (final item in await api.getCollection(
      '/invoices?page_index=0&page_size=200',
    ))
      if (item['shop_id'] == shopId) InvoiceRecord.fromJson(item),
  ];
}
