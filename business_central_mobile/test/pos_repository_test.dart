import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/pos/data/online_pos_repository.dart';
import 'package:business_central_mobile/features/pos/domain/pos_models.dart';

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
  _Client(this.responses);
  final List<NetworkResponse> responses;
  final List<String> paths = [];
  Object? lastBody;

  @override
  Future<NetworkResponse> request({
    String method = 'GET',
    String path = '/',
    Object? body,
    Map<String, String> headers = const {},
  }) async {
    paths.add('$method $path');
    lastBody = body;
    return responses.removeAt(0);
  }
}

void main() {
  test(
    'POS repository uses the shop-scoped catalog and backend quote',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'variant-1',
                'name': 'Cable',
                'sku': 'CAB-1',
                'price': '10.00',
                'is_stock_tracked': true,
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'subtotal': '20.00',
              'discount_total': '0.00',
              'tax_total': '2.00',
              'grand_total': '22.00',
              'currency_code': 'USD',
            },
          },
        ),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {'id': 'order-1', 'number': 'INV-1', 'status': 'PAID'},
          },
        ),
      ]);
      final repository = OnlinePosRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );

      final catalog = await repository.catalog(shopId: 'shop-1');
      expect(catalog.single.sku, 'CAB-1');
      final quote = await repository.quote(
        shopId: 'shop-1',
        lines: [PosCartLine(item: catalog.single, quantity: 2)],
      );
      expect(quote.grandTotal, '22.00');
      final checkout = await repository.checkout(
        shopId: 'shop-1',
        lines: [PosCartLine(item: catalog.single, quantity: 2)],
        paymentMethod: 'cash',
        customerName: 'Walk-in',
      );
      expect(checkout.id, 'order-1');
      expect(checkout.number, 'INV-1');
      expect(client.paths, [
        'GET /pos/catalog?page_index=0&page_size=200&shop_id=shop-1',
        'POST /pos/quote',
        'POST /pos/orders',
      ]);
      expect((client.lastBody! as Map<String, Object?>)['shop_id'], 'shop-1');
      final checkoutBody = client.lastBody! as Map<String, Object?>;
      expect(checkoutBody['payment_method'], 'CASH');
      expect(checkoutBody['customer_name'], 'Walk-in');
      expect(checkoutBody['idempotency_key'], isA<String>());
    },
  );

  test('quote rejects an empty cart before contacting the backend', () async {
    final client = _Client([]);
    final repository = OnlinePosRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
    );
    await expectLater(
      repository.quote(shopId: 'shop-1', lines: const []),
      throwsA(isA<FormatException>()),
    );
    expect(client.paths, isEmpty);
  });

  test(
    'barcode lookup preserves stock asset identity for direct checkout',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'variant-1',
                'name': 'Laptop',
                'sku': 'LAP-1',
                'barcode': 'SN-100',
                'stock_asset_id': 'asset-1',
                'barcode_match': 'STOCK',
                'is_stock_tracked': true,
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {'id': 'order-1', 'status': 'PAID'},
          },
        ),
      ]);
      final repository = OnlinePosRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );
      final matches = await repository.lookupBarcode(
        shopId: 'shop-1',
        barcode: 'SN-100',
      );
      expect(matches.single.stockAssetId, 'asset-1');
      await repository.checkout(
        shopId: 'shop-1',
        lines: [PosCartLine(item: matches.single, quantity: 1)],
        paymentMethod: 'cash',
      );
      final body = client.lastBody! as Map<String, Object?>;
      expect((body['lines'] as List).single['asset_id'], 'asset-1');
    },
  );

  test(
    'checkout rejects an unsupported payment method before contacting backend',
    () async {
      final client = _Client([]);
      final repository = OnlinePosRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );
      final item = const PosCatalogItem(
        id: 'variant-1',
        name: 'Cable',
        sku: 'CAB-1',
        isStockTracked: true,
      );
      await expectLater(
        repository.checkout(
          shopId: 'shop-1',
          lines: [PosCartLine(item: item, quantity: 1)],
          paymentMethod: 'CRYPTO',
        ),
        throwsA(isA<FormatException>()),
      );
      expect(client.paths, isEmpty);
    },
  );
}
