import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/transaction_history/data/online_transaction_history_repository.dart';

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
    'history list is shop and filter scoped, and detail preserves FIFO fields',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'event-1',
                'event_type': 'TRANSACTION',
                'reference': 'INV-1',
                'occurred_at': '2026-08-05T10:00:00Z',
                'status': 'PAID',
                'amount': '22.00',
                'shop_id': 'shop-1',
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'entry': {
                'id': 'event-1',
                'event_type': 'TRANSACTION',
                'reference': 'INV-1',
                'occurred_at': '2026-08-05T10:00:00Z',
                'status': 'PAID',
              },
              'lines': [
                {
                  'description': 'Cable',
                  'quantity': '2',
                  'unit_price': '10.00',
                  'original_cost': '12.00',
                  'line_total': '20.00',
                  'gross_profit': '8.00',
                },
              ],
              'payments': [
                {'method': 'CASH', 'status': 'CAPTURED', 'amount': '22.00'},
              ],
              'refunds': [],
              'total_cost': '12.00',
              'gross_profit': '10.00',
              'gross_margin': '45.45',
            },
          },
        ),
      ]);
      final repository = OnlineTransactionHistoryRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );

      final entries = await repository.list(
        shopId: 'shop-1',
        eventType: 'TRANSACTION',
        from: DateTime.utc(2026, 8, 1),
        to: DateTime.utc(2026, 8, 5),
        query: 'INV-1',
      );
      final detail = await repository.detail('event-1');

      final query = Uri.parse(
        client.paths.first.split(' ').last,
      ).queryParameters;
      expect(query['filter'], contains('shop_id:shop-1'));
      expect(query['filter'], contains('event_type:TRANSACTION'));
      expect(query['query'], 'INV-1');
      expect(entries.single.amount, '22.00');
      expect(detail.lines.single.originalCost, '12.00');
      expect(detail.payments.single.amount, '22.00');
    },
  );
}
