import 'dart:convert';
import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/webview/native_database_bridge.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  test(
    'local owner edits and deletes a sale atomically, restores stock and protects scope',
    () async {
      final db = AppDatabase(executor: NativeDatabase.memory());
      addTearDown(db.close);
      final bridge = NativeDatabaseBridge(database: db);
      final scripts = <String>[];
      bridge.attachJavaScriptEvaluator(
        (s) async => scripts.add(s),
        database: db,
      );
      Future<String> send(String method, Map<String, dynamic> payload) async {
        await bridge.handleMessage(
          JavaScriptMessage(
            message: jsonEncode({
              'id': 'test',
              'method': method,
              'payload': payload,
            }),
          ),
        );
        return scripts.last;
      }

      await db
          .into(db.userMemberships)
          .insert(
            UserMembershipsCompanion.insert(
              id: 'owner',
              merchantId: 'merchant',
              identityId: 'identity',
              displayName: 'Owner',
              createdAt: 'now',
            ),
          );
      await db
          .into(db.roles)
          .insert(
            RolesCompanion.insert(
              id: 'role',
              merchantId: 'merchant',
              code: 'merchant',
              name: 'Owner',
            ),
          );
      await db
          .into(db.membershipRoles)
          .insert(
            MembershipRolesCompanion.insert(
              merchantId: 'merchant',
              membershipId: 'owner',
              roleId: 'role',
              grantedAt: 'now',
            ),
          );
      await db
          .into(db.rolePermissions)
          .insert(
            RolePermissionsCompanion.insert(
              roleId: 'role',
              permissionCode: 'tenant.write',
            ),
          );
      await db
          .into(db.cachedCatalogProducts)
          .insert(
            CachedCatalogProductsCompanion.insert(
              id: 'product',
              merchantId: 'merchant',
              name: 'Widget',
              productType: 'PHYSICAL',
              updatedAt: 'now',
            ),
          );
      await db
          .into(db.cachedCatalogVariants)
          .insert(
            CachedCatalogVariantsCompanion.insert(
              id: 'variant',
              merchantId: 'merchant',
              productId: 'product',
              sku: 'W',
              name: 'Widget',
              baseUnitId: 'unit',
              unitOfMeasure: 'Each',
              isStockTracked: const Value(true),
              quantityOnHand: const Value('20'),
              price: const Value('10'),
              updatedAt: 'now',
            ),
          );
      await send('checkout', {
        'order': {
          'id': 'order',
          'merchant_id': 'merchant',
          'shop_id': 'shop',
          'subtotal': '20',
          'grand_total': '20',
          'lines': [
            {
              'id': 'line',
              'variant_id': 'variant',
              'name': 'Widget',
              'quantity': 2,
              'unit_price': '10',
              'line_total': '20',
            },
          ],
        },
      });
      final original = await db.select(db.localOrders).getSingle();
      final request = <String, dynamic>{
        'id': 'order',
        'merchant_id': 'merchant',
        'shop_id': 'shop',
        'membership_id': 'owner',
        'expected_updated_at': original.createdAt,
        'idempotency_key': 'edit',
        'customer_name': 'Edited',
        'payment_method': 'Cash',
        'delivery_fee': '2',
        'delivery_payment_status': 'UN_PAID',
        'lines': [
          {
            'variant_id': 'variant',
            'quantity': '3',
            'unit_price': '12',
            'discount_amount': '1',
            'tax_amount': '2',
          },
        ],
      };
      expect(
        await send('updateTransaction', {...request, 'membership_id': 'staff'}),
        contains('Only merchant owners'),
      );
      expect(
        await send('updateTransaction', {...request, 'shop_id': 'other-shop'}),
        contains('Transaction not found'),
      );
      expect(
        await send('updateTransaction', request),
        isNot(contains('"error"')),
      );
      expect(
        await send('updateTransaction', request),
        isNot(contains('"error"')),
      );
      expect((await db.select(db.localOrders).getSingle()).grandTotal, '39.00');
      expect(
        double.parse(
          (await db.select(db.cachedCatalogVariants).getSingle())
              .quantityOnHand!,
        ),
        17,
      );
      final metadata =
          await (db.select(db.appMetadata)
                ..where((t) => t.key.equals('order-version:merchant:order')))
              .getSingle();
      final bad = {
        ...request,
        'idempotency_key': 'bad',
        'expected_updated_at': metadata.value,
        'lines': [
          {
            'variant_id': 'variant',
            'quantity': '1000',
            'unit_price': '10',
            'discount_amount': '0',
            'tax_amount': '0',
          },
        ],
      };
      expect(
        await send('updateTransaction', bad),
        contains('Insufficient stock'),
      );
      expect((await db.select(db.localOrders).getSingle()).grandTotal, '39.00');
      final deletion = {
        ...request,
        'idempotency_key': 'delete',
        'expected_updated_at': metadata.value,
      };
      expect(
        await send('deleteTransaction', deletion),
        isNot(contains('"error"')),
      );
      expect(
        await send('deleteTransaction', deletion),
        isNot(contains('"error"')),
      );
      expect(await db.select(db.localOrders).get(), isEmpty);
      expect(await db.select(db.localOrderLines).get(), isEmpty);
      expect(await db.select(db.localPayments).get(), isEmpty);
      expect(await db.select(db.localInventoryMovements).get(), isEmpty);
      expect(
        double.parse(
          (await db.select(db.cachedCatalogVariants).getSingle())
              .quantityOnHand!,
        ),
        20,
      );
    },
  );
}
