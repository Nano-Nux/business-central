import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/staff/data/online_staff_repository.dart';

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
    'staff management preserves canonical membership routes and scope',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'identity-1',
                'membership_id': 'membership-1',
                'merchant_id': 'merchant-1',
                'email': 'staff@example.com',
                'display_name': 'Staff',
                'is_active': true,
                'platform_admin': false,
                'roles': [
                  {
                    'code': 'staff',
                    'permission_codes': ['tenant.read'],
                  },
                ],
                'shop_id': 'shop-1',
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'identity-2',
              'membership_id': 'membership-2',
              'merchant_id': 'merchant-1',
              'email': 'new@example.com',
              'display_name': 'New Staff',
              'is_active': true,
              'platform_admin': false,
              'roles': [],
              'shop_id': 'shop-1',
            },
          },
        ),
        const NetworkResponse(statusCode: 204),
      ]);
      final repository = OnlineStaffRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );

      expect((await repository.listUsers()).single.shopId, 'shop-1');
      final created = await repository.create(
        email: ' new@example.com ',
        password: 'temporary password',
        displayName: ' New Staff ',
        shopId: 'shop-1',
        roleCode: 'staff',
      );
      expect(created.membershipId, 'membership-2');
      expect((client.lastBody! as Map<String, Object?>)['shop_id'], 'shop-1');
      await repository.delete('membership-2');
      expect(client.paths, [
        'GET /users?page_index=0&page_size=100',
        'POST /users',
        'DELETE /users/membership-2',
      ]);
    },
  );
}
