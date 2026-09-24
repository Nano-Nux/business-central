import 'dart:convert';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/webview/native_database_bridge.dart';
import 'package:drift/drift.dart';
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

  test(
    'executes atomic checkout, creates order, lines, and deducts inventory',
    () async {
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
      final order = await (database.select(
        database.localOrders,
      )..where((t) => t.id.equals('ord-test-1'))).getSingle();
      expect(order.number, 'ORD-2026-001');
      expect(order.grandTotal, '50.00');
      expect(order.customerName, 'Alice Smith');

      // Verify lines in local SQLite
      final lines = await (database.select(
        database.localOrderLines,
      )..where((t) => t.orderId.equals('ord-test-1'))).get();
      expect(lines, hasLength(1));
      expect(lines.first.quantity, 2);

      // Verify inventory movement recorded
      final movements = await (database.select(
        database.localInventoryMovements,
      )..where((t) => t.variantId.equals('var-beans-1'))).get();
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
    },
  );

  test('executes raw queries and statements', () async {
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-exec-1',
          'method': 'rawExecute',
          'payload': {
            'sql':
                'INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
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

  test(
    'updates customer idempotently without SQLite unique constraint error',
    () async {
      // Save initial customer
      await bridge.handleMessage(
        JavaScriptMessage(
          message: jsonEncode({
            'id': 'cust-create',
            'method': 'saveCustomer',
            'payload': {
              'customer': {
                'id': 'cust-reuse-1',
                'merchant_id': 'merch-1',
                'name': 'Bob Initial',
                'phone': '+1111111111',
                'email': 'bob@example.com',
              },
            },
          }),
        ),
      );

      expect(executedScripts, hasLength(1));
      expect(executedScripts.first, contains('Bob Initial'));

      executedScripts.clear();

      // Update customer with same id and merchant_id
      await bridge.handleMessage(
        JavaScriptMessage(
          message: jsonEncode({
            'id': 'cust-update',
            'method': 'saveCustomer',
            'payload': {
              'customer': {
                'id': 'cust-reuse-1',
                'merchant_id': 'merch-1',
                'name': 'Bob Updated',
                'phone': '+9999999999',
                'email': 'bob.updated@example.com',
              },
            },
          }),
        ),
      );

      expect(executedScripts, hasLength(1));
      expect(executedScripts.first, contains('cust-update'));
      expect(executedScripts.first, contains('Bob Updated'));
      expect(executedScripts.first, isNot(contains('"error":')));

      // Verify in database that there is only 1 record
      final records =
          await (database.select(database.localCanonicalRecords)..where(
                (t) =>
                    t.merchantId.equals('merch-1') &
                    t.entityType.equals('customer') &
                    t.entityId.equals('cust-reuse-1'),
              ))
              .get();
      expect(records, hasLength(1));
      final decoded =
          jsonDecode(records.first.payloadJson) as Map<String, dynamic>;
      expect(decoded['name'], 'Bob Updated');
      expect(decoded['phone'], '+9999999999');
    },
  );

  test(
    'checkout handles multiple lines for the same variant without eventKey collision',
    () async {
      // Setup tracked product
      await bridge.handleMessage(
        JavaScriptMessage(
          message: jsonEncode({
            'id': 'setup-prod-multi',
            'method': 'saveProduct',
            'payload': {
              'product': {
                'id': 'prod-bagel',
                'merchant_id': 'merch-1',
                'name': 'Everything Bagel',
                'product_type': 'SIMPLE',
                'variants': [
                  {
                    'id': 'var-bagel-1',
                    'sku': 'BAGEL-01',
                    'barcode': '7788990011',
                    'name': 'Single Bagel',
                    'price': '3.50',
                    'quantity_on_hand': '50',
                    'is_stock_tracked': true,
                  },
                ],
              },
            },
          }),
        ),
      );

      executedScripts.clear();

      // Checkout with TWO lines using the SAME variant ID (e.g. customized differently or scanned twice)
      await bridge.handleMessage(
        JavaScriptMessage(
          message: jsonEncode({
            'id': 'req-checkout-multi',
            'method': 'checkout',
            'payload': {
              'order': {
                'provisional_id': 'ord-multi-lines-1',
                'order_number': 'ORD-MULTI-01',
                'merchant_id': 'merch-1',
                'shop_id': 'shop-main',
                'subtotal': '10.50',
                'grand_total': '10.50',
                'payment_method': 'CASH',
                'lines': [
                  {
                    'id': 'line-bagel-a',
                    'variant_id': 'var-bagel-1',
                    'sku': 'BAGEL-01',
                    'name': 'Single Bagel (Toasted)',
                    'unit_price': '3.50',
                    'quantity': 1,
                    'line_total': '3.50',
                  },
                  {
                    'id': 'line-bagel-b',
                    'variant_id': 'var-bagel-1',
                    'sku': 'BAGEL-01',
                    'name': 'Single Bagel (Untoasted)',
                    'unit_price': '3.50',
                    'quantity': 2,
                    'line_total': '7.00',
                  },
                ],
              },
            },
          }),
        ),
      );

      expect(executedScripts, hasLength(1));
      expect(executedScripts.first, contains('req-checkout-multi'));
      expect(executedScripts.first, contains('ORD-MULTI-01'));

      // Check movements: should have 2 distinct inventory movements with line-based eventKey
      final movements = await (database.select(
        database.localInventoryMovements,
      )..where((t) => t.variantId.equals('var-bagel-1'))).get();
      expect(movements, hasLength(2));
      expect(
        movements.map((m) => m.eventKey),
        containsAll([
          'pos_sale_ord-multi-lines-1_line-bagel-a',
          'pos_sale_ord-multi-lines-1_line-bagel-b',
        ]),
      );

      // Check lines
      final lines = await (database.select(
        database.localOrderLines,
      )..where((t) => t.orderId.equals('ord-multi-lines-1'))).get();
      expect(lines, hasLength(2));
    },
  );

  test('getProducts searches by barcode and variant SKU', () async {
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'setup-prod-search',
          'method': 'saveProduct',
          'payload': {
            'product': {
              'id': 'prod-scanner-test',
              'merchant_id': 'merch-1',
              'name': 'Wireless Barcode Scanner',
              'product_type': 'SIMPLE',
              'variants': [
                {
                  'id': 'var-scanner-v1',
                  'sku': 'WLS-SCAN-PRO',
                  'barcode': '8901234567890',
                  'name': 'Pro Model',
                  'price': '120.00',
                  'quantity_on_hand': '5',
                },
              ],
            },
          },
        }),
      ),
    );

    executedScripts.clear();

    // Search by barcode
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'search-barcode',
          'method': 'getProducts',
          'payload': {'search': '8901234567890'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('search-barcode'));
    expect(executedScripts.first, contains('Wireless Barcode Scanner'));

    executedScripts.clear();

    // Search by SKU
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'search-sku',
          'method': 'getProducts',
          'payload': {'search': 'WLS-SCAN-PRO'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('search-sku'));
    expect(executedScripts.first, contains('Wireless Barcode Scanner'));
  });

  test('handles deleteProduct and getOrder', () async {
    // Create product to delete
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'setup-delete-prod',
          'method': 'saveProduct',
          'payload': {
            'product': {
              'id': 'prod-to-delete',
              'merchant_id': 'merch-1',
              'name': 'Obsolete Item',
              'variants': [
                {'id': 'var-to-delete', 'sku': 'OBS-001', 'price': '1.00'},
              ],
            },
          },
        }),
      ),
    );

    executedScripts.clear();

    // Delete product
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-delete-prod',
          'method': 'deleteProduct',
          'payload': {'id': 'prod-to-delete'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-delete-prod'));
    expect(executedScripts.first, contains('true'));

    // Verify soft-deleted in DB (isActive = false)
    final prod = await (database.select(
      database.cachedCatalogProducts,
    )..where((t) => t.id.equals('prod-to-delete'))).getSingleOrNull();
    expect(prod?.isActive, false);

    executedScripts.clear();

    // First checkout an order to retrieve with getOrder
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-checkout-for-get',
          'method': 'checkout',
          'payload': {
            'order': {
              'id': 'ord-get-test-1',
              'order_number': 'ORD-GET-01',
              'merchant_id': 'merch-1',
              'grand_total': '25.00',
              'payment_method': 'CASH',
              'lines': [],
            },
          },
        }),
      ),
    );

    executedScripts.clear();

    // Test getOrder
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-get-order',
          'method': 'getOrder',
          'payload': {'id': 'ord-get-test-1'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-get-order'));
    expect(executedScripts.first, contains('ORD-GET-01'));
  });

  test('synchronizes theme and layout companion keys in saveSetting', () async {
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-theme-sync',
          'method': 'saveSetting',
          'payload': {'key': 'bc.theme', 'value': 'sunset'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));

    // Verify both bc.theme and theme are stored in AppMetadata
    final bcTheme = await (database.select(
      database.appMetadata,
    )..where((t) => t.key.equals('bc.theme'))).getSingleOrNull();
    final theme = await (database.select(
      database.appMetadata,
    )..where((t) => t.key.equals('theme'))).getSingleOrNull();

    expect(bcTheme?.value, 'sunset');
    expect(theme?.value, 'sunset');
  });
}
