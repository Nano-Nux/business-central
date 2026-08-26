import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/customers/data/online_customers_repository.dart';

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

  @override
  Future<NetworkResponse> request({
    String method = 'GET',
    String path = '/',
    Object? body,
    Map<String, String> headers = const {},
  }) async => responses.removeAt(0);
}

void main() {
  test(
    'customer projection combines selected-shop sales and repairs',
    () async {
      final repository = OnlineCustomersRepository(
        OnlineAuthApi(
          client: _Client([
            const NetworkResponse(
              statusCode: 200,
              data: {
                'data': [
                  {
                    'shop_id': 'shop-1',
                    'customer': 'Ada',
                    'customer_phone': '555-1',
                  },
                  {
                    'shop_id': 'shop-2',
                    'customer': 'Other shop',
                    'customer_phone': '555-2',
                  },
                ],
              },
            ),
            const NetworkResponse(
              statusCode: 200,
              data: {
                'data': [
                  {
                    'shop_id': 'shop-1',
                    'customer_name': 'Ada',
                    'customer_phone': '555-1',
                  },
                ],
              },
            ),
          ]),
          sessionStore: _Store(),
        ),
      );

      final customers = await repository.list(shopId: 'shop-1');
      expect(customers.single.name, 'Ada');
      expect(customers.single.sales, 1);
      expect(customers.single.repairs, 1);
    },
  );
}
