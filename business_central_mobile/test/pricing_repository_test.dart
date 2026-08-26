import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/catalog/data/online_pricing_repository.dart';

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
    'pricing reads and writes preserve price-list and variant identity',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'prices-1',
                'merchant_id': 'merchant-1',
                'code': 'RETAIL',
                'currency_code': 'USD',
                'is_default': true,
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'merchant_id': 'merchant-1',
                'price_list_id': 'prices-1',
                'variant_id': 'variant-1',
                'amount': '12.50',
                'valid_from': '2026-08-05T00:00:00Z',
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'prices-2',
              'merchant_id': 'merchant-1',
              'code': 'WHOLESALE',
              'currency_code': 'USD',
              'is_default': false,
            },
          },
        ),
        const NetworkResponse(statusCode: 204),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'merchant_id': 'merchant-1',
              'price_list_id': 'prices-1',
              'variant_id': 'variant-1',
              'amount': '13.00',
              'valid_from': '2026-08-05T00:00:00Z',
            },
          },
        ),
        const NetworkResponse(statusCode: 204),
      ]);
      final repository = OnlinePricingRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );

      expect(
        (await repository.listPriceLists(merchantId: 'merchant-1')).single.code,
        'RETAIL',
      );
      expect(
        (await repository.listPrices(priceListId: 'prices-1')).single.amount,
        '12.50',
      );
      expect(
        (await repository.createPriceList(
          code: 'WHOLESALE',
          currencyCode: 'USD',
          isDefault: false,
        )).id,
        'prices-2',
      );
      await repository.deletePriceList(id: 'prices-2');
      expect(
        (await repository.upsertPrice(
          priceListId: 'prices-1',
          variantId: 'variant-1',
          amount: '13.00',
        )).amount,
        '13.00',
      );
      final upsertBody = client.lastBody! as Map<String, Object?>;
      expect(upsertBody['price_list_id'], 'prices-1');
      expect(upsertBody['variant_id'], 'variant-1');
      await repository.deletePrice(
        priceListId: 'prices-1',
        variantId: 'variant-1',
      );
      expect(client.paths, [
        'GET /pricing/price-lists?page_index=0&page_size=100',
        'GET /pricing/price-lists/prices-1/prices?page_index=0&page_size=500',
        'POST /pricing/price-lists',
        'DELETE /pricing/price-lists/prices-2',
        'POST /pricing/prices',
        'DELETE /pricing/prices',
      ]);
    },
  );
}
