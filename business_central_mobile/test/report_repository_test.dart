import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/reports/data/online_reports_repository.dart';

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

  @override
  Future<NetworkResponse> request({
    String method = 'GET',
    String path = '/',
    Object? body,
    Map<String, String> headers = const {},
  }) async {
    paths.add('$method $path');
    return responses.removeAt(0);
  }
}

void main() {
  test(
    'reports use the selected shop and preserve exact response strings',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'order_count': 3,
              'gross_sales': '100.10',
              'gross_profit': '30.10',
              'cost_of_goods_sold': '70.00',
            },
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'day': '2026-08-05T00:00:00Z',
                'order_count': 3,
                'net_sales': '100.10',
                'gross_profit': '30.10',
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'product_name': 'Cable',
                'variant_name': 'Standard',
                'sku': 'CAB-1',
                'item_quantity': '2',
                'net_sales': '20.02',
                'gross_profit': '10.02',
              },
            ],
          },
        ),
      ]);
      final repository = OnlineReportsRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );

      final snapshot = await repository.load(
        shopId: 'shop-1',
        from: DateTime.utc(2026, 8, 1),
        to: DateTime.utc(2026, 8, 5),
      );

      expect(snapshot.summary.grossSales, '100.10');
      expect(snapshot.days.single.netSales, '100.10');
      expect(snapshot.topProducts.single.netSales, '20.02');
      expect(client.paths, hasLength(3));
      for (final path in client.paths) {
        expect(
          Uri.parse(path.split(' ').last).queryParameters['shop_id'],
          'shop-1',
        );
      }
    },
  );
}
