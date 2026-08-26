import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/invoices/data/online_invoices_repository.dart';

class _Store implements SecureSessionStore {
  @override
  Future<void> clear() async {}
  @override
  Future<String?> readAccessToken() async => 'access';
  @override
  Future<String?> readRefreshToken() async => 'refresh';
  @override
  Future<void> writeAccessToken(String token) async {}
  @override
  Future<void> writeRefreshToken(String token) async {}
}

class _Client implements NetworkClient {
  @override
  Future<NetworkResponse> request({
    String method = 'GET',
    String path = '/',
    Object? body,
    Map<String, String> headers = const {},
  }) async => const NetworkResponse(
    statusCode: 200,
    data: {
      'data': [
        {
          'id': 'invoice-1',
          'number': 'INV-1',
          'shop_id': 'shop-1',
          'customer': 'Ada',
          'merchant_name': 'Merchant',
          'currency_code': 'USD',
          'created_at': '2026-08-05T10:00:00Z',
          'status': 'Paid',
          'subtotal': '20.00',
          'discount_total': '0.00',
          'tax_total': '2.00',
          'grand_total': '22.00',
          'items': [
            {'name': 'Cable', 'quantity': '2', 'unit_price': '10.00'},
          ],
        },
        {
          'id': 'invoice-2',
          'number': 'INV-2',
          'shop_id': 'shop-2',
          'customer': 'Other shop',
          'merchant_name': 'Merchant',
          'currency_code': 'USD',
          'created_at': '2026-08-05T10:00:00Z',
          'status': 'Paid',
          'subtotal': '5.00',
          'discount_total': '0.00',
          'tax_total': '0.00',
          'grand_total': '5.00',
          'items': [],
        },
      ],
    },
  );
}

void main() {
  test('invoice reads remain selected-shop scoped and exact', () async {
    final repository = OnlineInvoicesRepository(
      OnlineAuthApi(client: _Client(), sessionStore: _Store()),
    );
    final invoices = await repository.list(shopId: 'shop-1');
    expect(invoices.single.number, 'INV-1');
    expect(invoices.single.grandTotal, '22.00');
    expect(invoices.single.items.single.quantity, '2');
  });
}
