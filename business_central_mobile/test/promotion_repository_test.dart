import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/promotions/data/online_promotions_repository.dart';

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
  test('promotion definitions are managed by the backend', () async {
    final client = _Client([
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'promotion-1',
              'name': 'Summer',
              'promotion_type': 'PERCENTAGE',
              'value': '10.00',
              'minimum_subtotal': '0.00',
              'redemption_count': 0,
              'is_active': true,
            },
          ],
        },
      ),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'promotion-2',
            'name': 'New',
            'promotion_type': 'FIXED_AMOUNT',
            'value': '5.00',
            'minimum_subtotal': '20.00',
            'redemption_count': 0,
            'is_active': true,
          },
        },
      ),
      const NetworkResponse(statusCode: 204),
    ]);
    final repository = OnlinePromotionsRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
    );
    expect((await repository.list()).single.name, 'Summer');
    expect(
      (await repository.create(
        name: 'New',
        promotionType: 'FIXED_AMOUNT',
        value: '5.00',
        minimumSubtotal: '20.00',
      )).id,
      'promotion-2',
    );
    expect((client.lastBody! as Map<String, Object?>)['value'], '5.00');
    await repository.delete('promotion-2');
    expect(client.paths, [
      'GET /promotions?page_index=0&page_size=100',
      'POST /promotions',
      'DELETE /promotions/promotion-2',
    ]);
  });

  test(
    'promotion schedules, codes, and product scopes use canonical routes',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'promotion-1',
                'name': 'Summer',
                'promotion_type': 'PERCENTAGE',
                'value': '10.00',
                'minimum_subtotal': '0.00',
                'redemption_count': 0,
                'starts_at': '2026-08-01T00:00:00Z',
                'ends_at': '2026-08-31T23:59:59Z',
                'is_active': true,
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'promotion-2',
              'name': 'Scheduled',
              'promotion_type': 'FIXED_AMOUNT',
              'value': '5.00',
              'minimum_subtotal': '20.00',
              'redemption_count': 0,
              'is_active': true,
            },
          },
        ),
        const NetworkResponse(statusCode: 200, data: {'data': []}),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'code-1',
              'promotion_id': 'promotion-1',
              'code': 'SUMMER',
              'is_active': true,
              'redemption_count': 0,
            },
          },
        ),
        const NetworkResponse(statusCode: 204),
        const NetworkResponse(statusCode: 200, data: {'data': []}),
        const NetworkResponse(statusCode: 201, data: {'data': {}}),
        const NetworkResponse(statusCode: 204),
      ]);
      final repository = OnlinePromotionsRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );
      final promotions = await repository.list();
      expect(promotions.single.startsAt, DateTime.utc(2026, 8, 1));
      await repository.create(
        name: 'Scheduled',
        promotionType: 'FIXED_AMOUNT',
        value: '5.00',
        startsAt: DateTime.utc(2026, 8, 1),
        endsAt: DateTime.utc(2026, 8, 31),
        usageLimit: 10,
      );
      expect((client.lastBody! as Map<String, Object?>)['usage_limit'], 10);
      expect(await repository.listCodes('promotion-1'), isEmpty);
      expect(
        (await repository.createCode(
          promotionId: 'promotion-1',
          code: 'SUMMER',
          usageLimit: 10,
        )).code,
        'SUMMER',
      );
      await repository.deleteCode('code-1');
      expect(await repository.listProductScopes('promotion-1'), isEmpty);
      await repository.assignProductScope(
        promotionId: 'promotion-1',
        productId: 'product-1',
        variantId: 'variant-1',
      );
      await repository.removeProductScope('scope-1');
      expect(client.paths, [
        'GET /promotions?page_index=0&page_size=100',
        'POST /promotions',
        'GET /promotions/promotion-1/codes?page_index=0&page_size=100',
        'POST /promotions/codes',
        'DELETE /promotions/codes/code-1',
        'GET /promotions/promotion-1/products?page_index=0&page_size=100',
        'POST /promotions/products',
        'DELETE /promotions/products/scope-1',
      ]);
    },
  );
}
