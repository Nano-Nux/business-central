import 'dart:convert';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/webview/native_database_bridge.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  late AppDatabase database;
  late NativeDatabaseBridge bridge;
  final executedScripts = <String>[];

  setUp(() {
    database = AppDatabase(executor: NativeDatabase.memory());
    bridge = NativeDatabaseBridge(database: database);
    executedScripts.clear();
    bridge.attachJavaScriptEvaluator(
      (script) async => executedScripts.add(script),
      database: database,
    );
  });

  tearDown(() async {
    await database.close();
  });

  test('saves and gets settings in AppMetadata', () async {
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-setting-1',
          'method': 'saveSetting',
          'payload': {'key': 'test_setting', 'value': 'test_value'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-setting-1'));
    expect(executedScripts.first, contains('true'));

    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-setting-2',
          'method': 'getSetting',
          'payload': {'key': 'test_setting'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-setting-2'));
    expect(executedScripts.first, contains('test_value'));
  });

  test('saves and gets products with variants', () async {
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-prod-1',
          'method': 'saveProduct',
          'payload': {
            'product': {
              'id': 'prod-101',
              'merchant_id': 'merch-1',
              'name': 'Espresso Machine',
              'product_type': 'SIMPLE',
              'sell_price': '450.00',
              'variants': [
                {
                  'id': 'var-101',
                  'sku': 'SKU-ESP-1',
                  'name': 'Standard Silver',
                  'price': '450.00',
                  'quantity_on_hand': '10',
                },
              ],
            },
          },
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-prod-1'));

    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-prod-2',
          'method': 'getProducts',
          'payload': {'search': 'espresso'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-prod-2'));
    expect(executedScripts.first, contains('Espresso Machine'));
    expect(executedScripts.first, contains('SKU-ESP-1'));
  });

  test('saves and retrieves canonical customers', () async {
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-cust-1',
          'method': 'saveCustomer',
          'payload': {
            'customer': {
              'id': 'cust-1',
              'merchant_id': 'merch-1',
              'name': 'Alice Smith',
              'phone': '+1234567890',
              'email': 'alice@example.com',
            },
          },
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-cust-1'));
    expect(executedScripts.first, contains('Alice Smith'));

    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-cust-2',
          'method': 'getCustomers',
          'payload': {'search': 'Alice'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-cust-2'));
    expect(executedScripts.first, contains('Alice Smith'));
  });

  test('executes atomic checkout, creates order, lines, and deducts inventory', () async {
    // First insert a product with stock
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'setup-prod',
          'method': 'saveProduct',
          'payload': {
            'product': {
              'id': 'prod-item-1',
              'merchant_id': 'merch-1',
              'name': 'Coffee Beans 1kg',
              'product_type': 'SIMPLE',
              'variants': [
                {
                  'id': 'var-beans-1',
                  'sku': 'COFFEE-1KG',
                  'name': 'Dark Roast',
                  'price': '25.00',
                  'quantity_on_hand': '20',
                  'is_stock_tracked': true,
                },
              ],
            },
          },
        }),
      ),
    );

    executedScripts.clear();

    // Perform POS checkout
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-checkout-1',
          'method': 'checkout',
          'payload': {
            'order': {
              'id': 'ord-test-1',
              'order_number': 'ORD-2026-001',
              'merchant_id': 'merch-1',
              'shop_id': 'shop-main',
              'subtotal': '50.00',
              'grand_total': '50.00',
              'payment_method': 'CASH',
              'customer_name': 'Alice Smith',
              'customer_phone': '+1234567890',
              'lines': [
                {
                  'id': 'line-1',
                  'variant_id': 'var-beans-1',
                  'sku': 'COFFEE-1KG',
                  'name': 'Dark Roast',
                  'unit_price': '25.00',
                  'quantity': 2,
                  'line_total': '50.00',
                },
              ],
            },
          },
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-checkout-1'));
    expect(executedScripts.first, contains('ORD-2026-001'));
    expect(executedScripts.first, contains('COMPLETED'));

    // Verify order in local SQLite
    final order = await (database.select(database.localOrders)
          ..where((t) => t.id.equals('ord-test-1')))
        .getSingle();
    expect(order.number, 'ORD-2026-001');
    expect(order.grandTotal, '50.00');
    expect(order.customerName, 'Alice Smith');

    // Verify lines in local SQLite
    final lines = await (database.select(database.localOrderLines)
          ..where((t) => t.orderId.equals('ord-test-1')))
        .get();
    expect(lines, hasLength(1));
    expect(lines.first.quantity, 2);

    // Verify inventory movement recorded
    final movements = await (database.select(database.localInventoryMovements)
          ..where((t) => t.variantId.equals('var-beans-1')))
        .get();
    expect(movements, hasLength(1));
    expect(movements.first.quantity, '-2');

    // Verify getOrders method returns this order
    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-orders-1',
          'method': 'getOrders',
          'payload': {'limit': 10},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-orders-1'));
    expect(executedScripts.first, contains('ORD-2026-001'));
  });

  test('executes raw queries and statements', () async {
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-exec-1',
          'method': 'rawExecute',
          'payload': {
            'sql': 'INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
            'params': ['raw_key', 'raw_val', '2026-09-17T00:00:00Z'],
          },
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-exec-1'));

    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-query-1',
          'method': 'rawQuery',
          'payload': {
            'sql': 'SELECT key, value FROM app_metadata WHERE key = ?',
            'params': ['raw_key'],
          },
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-query-1'));
    expect(executedScripts.first, contains('raw_val'));
  });
}
