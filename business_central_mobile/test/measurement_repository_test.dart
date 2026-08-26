import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/catalog/data/online_measurement_repository.dart';

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
  test('measurement administration uses canonical unit contracts', () async {
    final client = _Client([
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'unit-1',
              'merchant_id': 'merchant-1',
              'code': 'EA',
              'name': 'Each',
              'symbol': 'ea',
              'dimension_code': 'COUNT',
              'allows_decimal': false,
              'is_active': true,
            },
          ],
        },
      ),
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'conversion-1',
              'merchant_id': 'merchant-1',
              'from_unit_id': 'unit-1',
              'to_unit_id': 'unit-2',
              'multiplier': '12',
              'additive_offset': '0',
              'is_active': true,
            },
          ],
        },
      ),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'unit-2',
            'merchant_id': 'merchant-1',
            'code': 'DZ',
            'name': 'Dozen',
            'dimension_code': 'COUNT',
            'allows_decimal': true,
            'is_active': true,
          },
        },
      ),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'conversion-2',
            'merchant_id': 'merchant-1',
            'from_unit_id': 'unit-1',
            'to_unit_id': 'unit-2',
            'multiplier': '12',
            'additive_offset': '0',
            'is_active': true,
          },
        },
      ),
      const NetworkResponse(statusCode: 204),
      const NetworkResponse(statusCode: 204),
    ]);
    final repository = OnlineMeasurementRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
    );

    expect((await repository.listUnits()).single.dimensionCode, 'COUNT');
    expect((await repository.listConversions()).single.multiplier, '12');
    await repository.createUnit(
      code: ' DZ ',
      name: ' Dozen ',
      dimensionCode: 'count',
    );
    expect(
      (client.lastBody! as Map<String, Object?>)['dimension_code'],
      'COUNT',
    );
    await repository.createConversion(
      fromUnitId: 'unit-1',
      toUnitId: 'unit-2',
      multiplier: '12',
    );
    await repository.deleteUnit('unit-2');
    await repository.deleteConversion('conversion-2');

    expect(client.paths, [
      'GET /units?page_index=0&page_size=200',
      'GET /unit-conversions?page_index=0&page_size=200',
      'POST /units',
      'POST /unit-conversions',
      'DELETE /units/unit-2',
      'DELETE /unit-conversions/conversion-2',
    ]);
  });
}
