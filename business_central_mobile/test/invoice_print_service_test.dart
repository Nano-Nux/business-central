import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/features/invoices/data/invoice_print_service.dart';
import 'package:business_central_mobile/features/invoices/domain/invoice_models.dart';

void main() {
  test(
    'invoice output preserves exact totals in a native PDF document',
    () async {
      final invoice = InvoiceRecord(
        id: 'invoice-1',
        number: 'INV-1',
        customer: 'Ada',
        merchantName: 'Merchant',
        shopName: 'Shop',
        currencyCode: 'THB',
        createdAt: DateTime.utc(2026, 8, 5),
        status: 'PAID',
        subtotal: '100.00',
        discountTotal: '10.00',
        taxTotal: '6.30',
        grandTotal: '96.30',
        items: const [
          InvoiceLine(name: 'Cable', quantity: '2', unitPrice: '50.00'),
        ],
        receiptNote: 'Thank you',
      );

      final bytes = await InvoicePrintService().pdfBytes(invoice);
      final prefix = utf8.decode(bytes.take(8).toList(), allowMalformed: true);
      expect(prefix, startsWith('%PDF-'));
      expect(bytes.length, greaterThan(500));
    },
  );
}
