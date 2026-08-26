import '../../../core/network/network_boundary.dart';
import '../../../core/security/secure_session_store.dart';

class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.fields,
  });
  final int statusCode;
  final String code;
  final String message;
  final Map<String, String>? fields;
  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}

class OnlineRole {
  const OnlineRole({required this.code, required this.permissionCodes});
  final String code;
  final List<String> permissionCodes;

  factory OnlineRole.fromJson(Map<String, Object?> json) => OnlineRole(
    code: json['code'] as String,
    permissionCodes: [
      for (final value
          in (json['permission_codes'] as List<Object?>? ?? const []))
        value as String,
    ],
  );
}

class OnlineUser {
  const OnlineUser({
    required this.id,
    required this.membershipId,
    required this.merchantId,
    required this.email,
    required this.displayName,
    required this.isActive,
    required this.roles,
    required this.platformAdmin,
    this.shopId,
    this.phone,
  });
  final String id;
  final String membershipId;
  final String merchantId;
  final String email;
  final String displayName;
  final bool isActive;
  final List<OnlineRole> roles;
  final bool platformAdmin;
  final String? shopId;
  final String? phone;

  factory OnlineUser.fromJson(Map<String, Object?> json) => OnlineUser(
    id: json['id'] as String,
    membershipId: json['membership_id'] as String,
    merchantId: json['merchant_id'] as String,
    email: json['email'] as String,
    displayName: json['display_name'] as String,
    isActive: json['is_active'] as bool? ?? true,
    roles: [
      for (final value in (json['roles'] as List<Object?>? ?? const []))
        OnlineRole.fromJson(value! as Map<String, Object?>),
    ],
    platformAdmin: json['platform_admin'] as bool? ?? false,
    shopId: json['shop_id'] as String?,
    phone: json['phone'] as String?,
  );

  bool can(String permission) =>
      platformAdmin ||
      roles.any((role) => role.permissionCodes.contains(permission));
}

class OnlineMerchant {
  const OnlineMerchant({
    required this.id,
    required this.name,
    required this.slug,
    required this.currencyCode,
    required this.isActive,
  });
  final String id;
  final String name;
  final String slug;
  final String currencyCode;
  final bool isActive;

  factory OnlineMerchant.fromJson(Map<String, Object?> json) => OnlineMerchant(
    id: json['id'] as String,
    name: json['name'] as String,
    slug: json['slug'] as String,
    currencyCode: json['default_currency_code'] as String,
    isActive: json['is_active'] as bool? ?? true,
  );
}

class OnlineShop {
  const OnlineShop({
    required this.id,
    required this.merchantId,
    required this.name,
    required this.code,
    required this.moduleCodes,
    required this.isActive,
    this.footerNote = '',
    this.timezone = 'UTC',
  });
  final String id;
  final String merchantId;
  final String name;
  final String code;
  final List<String> moduleCodes;
  final bool isActive;
  final String footerNote;
  final String timezone;

  factory OnlineShop.fromJson(Map<String, Object?> json) => OnlineShop(
    id: json['id'] as String,
    merchantId: json['merchant_id'] as String,
    name: json['name'] as String,
    code: json['code'] as String,
    moduleCodes: [
      for (final value in (json['module_codes'] as List<Object?>? ?? const []))
        value as String,
    ],
    isActive: json['is_active'] as bool? ?? true,
    footerNote: json['footer_note'] as String? ?? '',
    timezone: json['timezone'] as String? ?? 'UTC',
  );
}

class OnlineSession {
  const OnlineSession({
    required this.accessToken,
    required this.refreshToken,
    required this.tokenType,
    required this.expiresAt,
    required this.user,
  });
  final String accessToken;
  final String refreshToken;
  final String tokenType;
  final DateTime expiresAt;
  final OnlineUser user;

  factory OnlineSession.fromJson(Map<String, Object?> json) => OnlineSession(
    accessToken: json['access_token'] as String,
    refreshToken: json['refresh_token'] as String,
    tokenType: json['token_type'] as String,
    expiresAt: DateTime.parse(json['expires_at'] as String).toUtc(),
    user: OnlineUser.fromJson(json['user']! as Map<String, Object?>),
  );
}

class OnlineAuthApi {
  OnlineAuthApi({required this.client, required this.sessionStore});

  final NetworkClient client;
  final SecureSessionStore sessionStore;
  NetworkClient get _client => client;
  SecureSessionStore get _sessionStore => sessionStore;
  Future<void>? _refreshInFlight;

  Future<OnlineSession> login({
    required String email,
    required String password,
    String? merchantId,
  }) async {
    final response = await _send(
      method: 'POST',
      path: '/auth/login',
      body: {
        'email': email.trim(),
        'password': password,
        if (merchantId != null && merchantId.trim().isNotEmpty)
          'merchant_id': merchantId.trim(),
      },
      authenticated: false,
    );
    final session = OnlineSession.fromJson(_data(response));
    await _persist(session);
    return session;
  }

  Future<OnlineSession> refresh() async {
    final refreshToken = await _sessionStore.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        code: 'SESSION_EXPIRED',
        message: 'Sign in again.',
      );
    }
    final response = await _send(
      method: 'POST',
      path: '/auth/refresh',
      body: {'refresh_token': refreshToken},
      authenticated: false,
    );
    final session = OnlineSession.fromJson(_data(response));
    await _persist(session);
    return session;
  }

  Future<OnlineUser> currentUser() async {
    final response = await _send(method: 'GET', path: '/auth/me');
    return OnlineUser.fromJson(_data(response));
  }

  Future<OnlineMerchant> currentMerchant() async {
    final response = await _send(method: 'GET', path: '/merchant');
    return OnlineMerchant.fromJson(_data(response));
  }

  Future<List<OnlineShop>> listShops() async {
    final response = await _send(
      method: 'GET',
      path: '/shops?page_index=0&page_size=100',
    );
    return [
      for (final value in _collection(response)) OnlineShop.fromJson(value),
    ];
  }

  Future<List<Map<String, Object?>>> getCollection(String path) async {
    final response = await _send(method: 'GET', path: path);
    return _collection(response);
  }

  Future<List<OnlineUser>> listUsers() async => [
    for (final value in await getCollection(
      '/users?page_index=0&page_size=100',
    ))
      OnlineUser.fromJson(value),
  ];

  Future<List<OnlineRole>> listRoles() async => [
    for (final value in await getCollection('/roles'))
      OnlineRole.fromJson(value),
  ];

  Future<OnlineUser> createUser(Map<String, Object?> body) async =>
      OnlineUser.fromJson(await postResource('/users', body));

  Future<OnlineUser> updateUser(String id, Map<String, Object?> body) async =>
      OnlineUser.fromJson(await patchResource('/users/$id', body));

  Future<void> deleteUser(String id) => deleteResource('/users/$id');

  Future<Map<String, Object?>> getResource(String path) async {
    final response = await _send(method: 'GET', path: path);
    return _data(response);
  }

  Future<Map<String, Object?>> postResource(
    String path,
    Map<String, Object?> body,
  ) async {
    final response = await _send(method: 'POST', path: path, body: body);
    return _data(response);
  }

  Future<void> deleteResource(String path, {Map<String, Object?>? body}) async {
    await _send(method: 'DELETE', path: path, body: body);
  }

  Future<Map<String, Object?>> patchResource(
    String path,
    Map<String, Object?> body,
  ) async {
    final response = await _send(method: 'PATCH', path: path, body: body);
    return _data(response);
  }

  Future<void> logout() async {
    try {
      await _send(
        method: 'POST',
        path: '/auth/logout',
        refreshOnUnauthorized: false,
      );
    } finally {
      await _sessionStore.clear();
    }
  }

  Future<NetworkResponse> _send({
    required String method,
    required String path,
    Object? body,
    bool authenticated = true,
    bool retried = false,
    bool refreshOnUnauthorized = true,
  }) async {
    final headers = <String, String>{};
    if (authenticated) {
      final accessToken = await _sessionStore.readAccessToken();
      if (accessToken != null && accessToken.isNotEmpty) {
        headers['Authorization'] = 'Bearer $accessToken';
      }
    }
    final response = await _client.request(
      method: method,
      path: path,
      body: body,
      headers: headers,
    );
    if (response.statusCode == 401 &&
        authenticated &&
        !retried &&
        refreshOnUnauthorized) {
      await _refreshOnce();
      return _send(
        method: method,
        path: path,
        body: body,
        authenticated: true,
        retried: true,
        refreshOnUnauthorized: refreshOnUnauthorized,
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _apiException(response);
    }
    return response;
  }

  Future<void> _refreshOnce() {
    final current = _refreshInFlight;
    if (current != null) return current;
    final future = refresh().then<void>((_) {});
    _refreshInFlight = future;
    return future.whenComplete(() => _refreshInFlight = null);
  }

  Future<void> _persist(OnlineSession session) async {
    await _sessionStore.writeAccessToken(session.accessToken);
    await _sessionStore.writeRefreshToken(session.refreshToken);
  }

  Map<String, Object?> _data(NetworkResponse response) {
    final data = response.data;
    if (data is! Map) {
      throw const ApiException(
        statusCode: 502,
        code: 'INVALID_RESPONSE',
        message: 'Invalid backend response.',
      );
    }
    final value = data['data'];
    if (value is! Map) {
      throw const ApiException(
        statusCode: 502,
        code: 'INVALID_RESPONSE',
        message: 'Invalid backend response.',
      );
    }
    return Map<String, Object?>.from(value);
  }

  List<Map<String, Object?>> _collection(NetworkResponse response) {
    final data = response.data;
    if (data is! Map || data['data'] is! List) {
      throw const ApiException(
        statusCode: 502,
        code: 'INVALID_RESPONSE',
        message: 'Invalid backend collection response.',
      );
    }
    return [
      for (final value in data['data'] as List<Object?>)
        Map<String, Object?>.from(value! as Map),
    ];
  }

  ApiException _apiException(NetworkResponse response) {
    final data = response.data;
    if (data is Map && data['error'] is Map) {
      final error = Map<String, Object?>.from(data['error'] as Map);
      return ApiException(
        statusCode: response.statusCode,
        code: error['code'] as String? ?? 'REQUEST_FAILED',
        message: error['message'] as String? ?? 'The request failed.',
      );
    }
    return ApiException(
      statusCode: response.statusCode,
      code: 'REQUEST_FAILED',
      message: 'The request failed.',
    );
  }
}
