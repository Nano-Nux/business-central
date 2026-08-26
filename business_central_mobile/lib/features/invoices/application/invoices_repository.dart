import '../domain/invoice_models.dart';

abstract interface class InvoicesRepository {
  Future<List<InvoiceRecord>> list({required String shopId});
}
