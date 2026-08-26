import 'dart:typed_data';

import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../domain/invoice_models.dart';
import 'invoice_logo.dart';

class InvoicePrintService {
  Future<void> share(InvoiceRecord invoice) async {
    final bytes = await pdfBytes(invoice);
    await Printing.sharePdf(bytes: bytes, filename: '${invoice.number}.pdf');
  }

  Future<void> print(InvoiceRecord invoice) async {
    final bytes = await pdfBytes(invoice);
    await Printing.layoutPdf(onLayout: (_) async => bytes);
  }

  Future<Uint8List> pdfBytes(InvoiceRecord invoice) async {
    final document = pw.Document();
    final logo = invoice.showShopLogo
        ? invoiceLogoBytes(invoice.shopLogoUrl)
        : null;
    document.addPage(
      pw.Page(
        build: (context) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            if (logo != null)
              pw.Center(
                child: pw.Image(
                  pw.MemoryImage(logo),
                  width: 72,
                  height: 48,
                  fit: pw.BoxFit.contain,
                ),
              ),
            pw.Center(
              child: pw.Text(
                invoice.shopName ?? '',
                style: pw.TextStyle(
                  fontSize: 18,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
            ),
            pw.Center(
              child: pw.Text(
                invoice.kind == 'repair'
                    ? 'Repair ticket invoice'
                    : 'Sales invoice',
              ),
            ),
            pw.SizedBox(height: 8),
            pw.Text('Invoice ${invoice.number}'),
            pw.Text('Date ${invoice.createdAt.toUtc().toIso8601String()}'),
            pw.Text('Customer ${invoice.customer}'),
            if (invoice.customerPhone != null)
              pw.Text('Customer phone ${invoice.customerPhone}'),
            pw.Text('Status ${invoice.status}'),
            pw.Divider(),
            for (final item in invoice.items)
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Expanded(
                    child: pw.Text('${item.name} x ${item.quantity}'),
                  ),
                  pw.Text('${item.unitPrice} ${invoice.currencyCode}'),
                ],
              ),
            pw.Divider(),
            _total('Subtotal', invoice.subtotal, invoice.currencyCode),
            _total('Discount', invoice.discountTotal, invoice.currencyCode),
            _total(
              invoice.taxLabel ?? 'Tax',
              invoice.taxTotal,
              invoice.currencyCode,
            ),
            _total(
              'Total',
              invoice.grandTotal,
              invoice.currencyCode,
              bold: true,
            ),
            if (invoice.paymentType != null)
              pw.Text('Payment ${invoice.paymentType}'),
            if (invoice.deliveryName != null)
              pw.Text(
                'Delivery ${invoice.deliveryName!}${invoice.deliveryContact == null ? '' : ' - ${invoice.deliveryContact}'}',
              ),
            if (invoice.deliveryFee != null)
              pw.Text(
                'Delivery fee ${invoice.deliveryFee} ${invoice.currencyCode}',
              ),
            if (invoice.note != null && invoice.note!.trim().isNotEmpty)
              pw.Text('Note ${invoice.note}'),
            if (invoice.receiptNote != null) pw.Text(invoice.receiptNote!),
            if (invoice.footerNote != null) pw.Text(invoice.footerNote!),
          ],
        ),
      ),
    );
    return document.save();
  }

  pw.Widget _total(
    String label,
    String value,
    String currency, {
    bool bold = false,
  }) => pw.Row(
    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
    children: [
      pw.Text(
        label,
        style: bold ? pw.TextStyle(fontWeight: pw.FontWeight.bold) : null,
      ),
      pw.Text(
        '$value $currency',
        style: bold ? pw.TextStyle(fontWeight: pw.FontWeight.bold) : null,
      ),
    ],
  );
}
