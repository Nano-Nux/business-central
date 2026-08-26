import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/settings/data/online_settings_repository.dart';

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
    'shop settings read and update preserve merchant/shop identity',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'id': 'shop-1',
              'merchant_id': 'merchant-1',
              'name': 'Main',
              'code': 'MAIN',
              'timezone': 'UTC',
              'is_active': true,
              'tax_rate': '7.00',
            },
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'id': 'shop-1',
              'merchant_id': 'merchant-1',
              'name': 'Updated',
              'code': 'UPD',
              'timezone': 'Asia/Bangkok',
              'is_active': true,
            },
          },
        ),
      ]);
      final repository = OnlineSettingsRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );
      final initial = await repository.load(
        merchantId: 'merchant-1',
        shopId: 'shop-1',
      );
      final updated = await repository.update(
        merchantId: 'merchant-1',
        shopId: 'shop-1',
        name: 'Updated',
        code: 'UPD',
        timezone: 'Asia/Bangkok',
        taxRate: '7.00',
      );
      expect(initial.taxRate, '7.00');
      expect(updated.name, 'Updated');
      expect(client.paths, ['GET /shops/shop-1', 'PATCH /shops/shop-1']);
      expect((client.lastBody! as Map<String, Object?>)['name'], 'Updated');
    },
  );
}
