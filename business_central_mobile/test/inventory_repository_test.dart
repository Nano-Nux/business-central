import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/inventory/data/inventory_cache_repository.dart';
import 'package:business_central_mobile/features/inventory/data/online_inventory_repository.dart';
import 'package:drift/native.dart';
import 'package:business_central_mobile/core/database/app_database.dart';

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
    'stock receiving is backend-authoritative and carries an event key',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {'id': 'movement-1'},
          },
        ),
      ]);
      final database = AppDatabase(executor: NativeDatabase.memory());
      final repository = OnlineInventoryRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
        InventoryCacheRepository(database),
      );
      await repository.stockIn(
        variantId: 'variant-1',
        destinationLocationId: 'location-1',
        quantity: '2.00',
        unitCost: '4.50',
        purchaseOrderId: 'po-1',
        purchaseOrderLineId: 'po-line-1',
        unitId: 'unit-1',
        receiptNumber: 'GR-1',
        batchNumber: 'BATCH-1',
        expiresAt: '2027-01-01T00:00:00Z',
      );
      final body = client.lastBody! as Map<String, Object?>;
      expect(client.paths, ['POST /inventory/stock-in']);
      expect(body['variant_id'], 'variant-1');
      expect(body['destination_location_id'], 'location-1');
      expect(body['purchase_order_id'], 'po-1');
      expect(body['purchase_order_line_id'], 'po-line-1');
      expect(body['unit_id'], 'unit-1');
      expect(body['receipt_number'], 'GR-1');
      expect(body['batch_number'], 'BATCH-1');
      expect(body['expires_at'], '2027-01-01T00:00:00Z');
      expect(body['event_key'], isA<String>());
      await database.closeForTest();
    },
  );

  test(
    'movement history filters selected-shop locations and parses detail',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'movement-1',
                'merchant_id': 'merchant-1',
                'variant_id': 'variant-1',
                'movement_type': 'RECEIPT',
                'destination_location_id': 'location-1',
                'quantity': '2.00',
                'unit_cost': '4.50',
                'event_key': 'event-1',
                'occurred_at': '2026-08-05T10:00:00Z',
                'created_at': '2026-08-05T10:00:00Z',
              },
              {
                'id': 'movement-2',
                'merchant_id': 'merchant-1',
                'variant_id': 'variant-2',
                'movement_type': 'RECEIPT',
                'destination_location_id': 'other-location',
                'quantity': '1.00',
                'unit_cost': '9.00',
                'event_key': 'event-2',
                'occurred_at': '2026-08-05T10:00:00Z',
                'created_at': '2026-08-05T10:00:00Z',
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'movement': {
                'id': 'movement-1',
                'merchant_id': 'merchant-1',
                'variant_id': 'variant-1',
                'movement_type': 'RECEIPT',
                'destination_location_id': 'location-1',
                'quantity': '2.00',
                'unit_cost': '4.50',
                'event_key': 'event-1',
                'occurred_at': '2026-08-05T10:00:00Z',
                'created_at': '2026-08-05T10:00:00Z',
              },
              'product_name': 'Phone',
              'variant_name': 'Black',
              'sku': 'PHONE-BLK',
              'total_cost': '9.00',
              'destination_location_name': 'Shop stock',
              'destination_location_code': 'SHOP-1',
              'cost_allocations': [
                {
                  'id': 'allocation-1',
                  'cost_layer_id': 'layer-1',
                  'quantity': '2.00',
                  'unit_cost': '4.50',
                  'total_cost': '9.00',
                  'layer_quantity_received': '10.00',
                  'layer_quantity_remaining': '8.00',
                  'source_receipt_number': 'GR-1',
                },
              ],
            },
          },
        ),
      ]);
      final database = AppDatabase(executor: NativeDatabase.memory());
      final repository = OnlineInventoryRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
        InventoryCacheRepository(database),
      );

      final movements = await repository.movements(locationIds: {'location-1'});
      expect(movements.single.id, 'movement-1');
      final detail = await repository.movementDetail(id: 'movement-1');
      expect(detail.productName, 'Phone');
      expect(detail.costAllocations.single.sourceReceiptNumber, 'GR-1');
      expect(client.paths, [
        'GET /inventory/movements?page_index=0&page_size=100',
        'GET /inventory/movements/movement-1',
      ]);
      await database.closeForTest();
    },
  );
}
