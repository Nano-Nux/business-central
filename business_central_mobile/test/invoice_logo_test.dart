import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/features/invoices/data/invoice_logo.dart';

void main() {
  test('uses only an explicitly provided data-image shop logo', () {
    final bytes = <int>[1, 2, 3, 4];
    final logo = 'data:image/png;base64,${base64Encode(bytes)}';

    expect(invoiceLogoBytes(logo), bytes);
    expect(invoiceLogoBytes(null), isNull);
    expect(
      invoiceLogoBytes('https://example.com/business-central.png'),
      isNull,
    );
  });
}
