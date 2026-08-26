import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';

class _FakeStore implements SecureSessionStore {
  String? access;
  String? refreshToken;
  @override
  Future<void> clear() async {
    access = null;
    refreshToken = null;
  }

  @override
  Future<String?> readAccessToken() async => access;
  @override
  Future<String?> readRefreshToken() async => refreshToken;
  @override
  Future<void> writeAccessToken(String token) async => access = token;
  @override
  Future<void> writeRefreshToken(String token) async => refreshToken = token;
}

class _FakeClient implements NetworkClient {
  final List<NetworkResponse> responses;
  final List<String> paths = [];
  final List<Map<String, String>> headers = [];
  _FakeClient(this.responses);

  @override
  Future<NetworkResponse> request({
    String method = 'GET',
    String path = '/',
    Object? body,
    Map<String, String> headers = const {},
  }) async {
    paths.add('$method $path');
    this.headers.add(headers);
    return responses.removeAt(0);
  }
}

Map<String, Object?> _session(String access, String refresh) => {
  'access_token': access,
  'refresh_token': refresh,
  'token_type': 'Bearer',
  'expires_at': '2030-01-01T00:00:00Z',
  'user': {
    'id': 'user-1',
    'membership_id': 'membership-1',
    'merchant_id': 'merchant-1',
    'email': 'owner@example.com',
    'display_name': 'Owner',
    'is_active': true,
    'platform_admin': false,
    'roles': [
      {
        'code': 'merchant',
        'permission_codes': ['tenant.read', 'tenant.write'],
      },
    ],
  },
};

void main() {
  test('login persists rotating tokens in secure storage', () async {
    final store = _FakeStore();
    final client = _FakeClient([
      NetworkResponse(
        statusCode: 200,
        data: {'data': _session('access-1', 'refresh-1')},
      ),
    ]);
    final api = OnlineAuthApi(client: client, sessionStore: store);

    final session = await api.login(
      email: 'owner@example.com',
      password: 'not-stored',
    );
    expect(session.user.can('tenant.read'), isTrue);
    expect(store.access, 'access-1');
    expect(store.refreshToken, 'refresh-1');
    expect(client.paths, ['POST /auth/login']);
  });

  test(
    '401 refreshes once and retries with the rotated access token',
    () async {
      final store = _FakeStore()
        ..access = 'expired'
        ..refreshToken = 'refresh-1';
      final client = _FakeClient([
        const NetworkResponse(
          statusCode: 401,
          data: {
            'error': {'code': 'UNAUTHORIZED'},
          },
        ),
        NetworkResponse(
          statusCode: 200,
          data: {'data': _session('access-2', 'refresh-2')},
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'id': 'user-1',
              'membership_id': 'membership-1',
              'merchant_id': 'merchant-1',
              'email': 'owner@example.com',
              'display_name': 'Owner',
              'is_active': true,
              'platform_admin': false,
              'roles': [],
            },
          },
        ),
      ]);
      final api = OnlineAuthApi(client: client, sessionStore: store);

      final user = await api.currentUser();
      expect(user.id, 'user-1');
      expect(store.access, 'access-2');
      expect(store.refreshToken, 'refresh-2');
      expect(client.paths, [
        'GET /auth/me',
        'POST /auth/refresh',
        'GET /auth/me',
      ]);
      expect(client.headers[0]['Authorization'], 'Bearer expired');
      expect(client.headers[2]['Authorization'], 'Bearer access-2');
    },
  );

  test(
    'logout clears local tokens even when the backend rejects the request',
    () async {
      final store = _FakeStore()
        ..access = 'access'
        ..refreshToken = 'refresh';
      final client = _FakeClient([
        const NetworkResponse(
          statusCode: 401,
          data: {
            'error': {'message': 'expired'},
          },
        ),
      ]);
      final api = OnlineAuthApi(client: client, sessionStore: store);
      await expectLater(api.logout(), throwsA(isA<ApiException>()));
      expect(store.access, isNull);
      expect(store.refreshToken, isNull);
    },
  );
}
