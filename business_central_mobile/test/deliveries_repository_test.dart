import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/deliveries/data/online_deliveries_repository.dart';

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
  test('delivery CRUD remains scoped to the active shop', () async {
    final client = _Client([
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'delivery-1',
              'shop_id': 'shop-1',
              'name': 'Courier',
              'contact_info': '555-0100',
              'is_active': true,
            },
          ],
        },
      ),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'delivery-2',
            'shop_id': 'shop-1',
            'name': 'Pickup',
            'contact_info': 'Front desk',
            'is_active': true,
          },
        },
      ),
      const NetworkResponse(statusCode: 204),
    ]);
    final repository = OnlineDeliveriesRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
    );

    expect(
      (await repository.list(
        merchantId: 'merchant-1',
        shopId: 'shop-1',
      )).single.name,
      'Courier',
    );
    final created = await repository.create(
      merchantId: 'merchant-1',
      shopId: 'shop-1',
      name: ' Pickup ',
      contactInfo: ' Front desk ',
    );
    expect(created.id, 'delivery-2');
    expect((client.lastBody! as Map<String, Object?>)['shop_id'], 'shop-1');
    await repository.delete('delivery-2');
    expect(client.paths, [
      'GET /shops/shop-1/deliveries?page_index=0&page_size=100',
      'POST /deliveries',
      'DELETE /deliveries/delivery-2',
    ]);
  });

  test('delivery payload rejects another shop', () async {
    final client = _Client([
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'delivery-1',
              'shop_id': 'shop-2',
              'name': 'Other shop',
              'contact_info': '555-0100',
            },
          ],
        },
      ),
    ]);
    await expectLater(
      OnlineDeliveriesRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      ).list(merchantId: 'merchant-1', shopId: 'shop-1'),
      throwsA(isA<StateError>()),
    );
  });
}
