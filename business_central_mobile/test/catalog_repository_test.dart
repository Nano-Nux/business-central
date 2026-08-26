import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/catalog/data/online_catalog_repository.dart';
import 'package:business_central_mobile/features/catalog/data/catalog_cache_repository.dart';
import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:drift/native.dart';

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
  test('catalog variant reads preserve product and merchant scope', () async {
    final database = AppDatabase(executor: NativeDatabase.memory());
    final client = _Client([
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'variant-1',
              'merchant_id': 'merchant-1',
              'product_id': 'product-1',
              'sku': 'CAB-1',
              'name': 'Standard',
              'base_unit_id': 'unit-1',
              'unit_of_measure': 'EA',
              'is_stock_tracked': true,
            },
          ],
        },
      ),
    ]);
    final repository = OnlineCatalogRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
      CatalogCacheRepository(database),
    );

    final variants = await repository.listVariants(
      merchantId: 'merchant-1',
      productId: 'product-1',
    );
    expect(variants.single.sku, 'CAB-1');
    expect(client.paths, [
      'GET /catalog/products/product-1/variants?page_index=0&page_size=100',
    ]);
    await database.closeForTest();
  });

  test('catalog administration uses backend CRUD routes', () async {
    final database = AppDatabase(executor: NativeDatabase.memory());
    const category = {
      'id': 'category-1',
      'merchant_id': 'merchant-1',
      'name': 'Cables',
      'slug': 'cables',
    };
    const product = {
      'id': 'product-1',
      'merchant_id': 'merchant-1',
      'name': 'Cable',
      'product_type': 'PHYSICAL',
      'is_active': true,
      'category_ids': ['category-1'],
      'category_names': ['Cables'],
    };
    const variant = {
      'id': 'variant-1',
      'merchant_id': 'merchant-1',
      'product_id': 'product-1',
      'sku': 'CAB-1',
      'name': 'Standard',
      'base_unit_id': 'unit-1',
      'unit_of_measure': 'EA',
      'is_stock_tracked': true,
    };
    final client = _Client([
      const NetworkResponse(statusCode: 201, data: {'data': category}),
      const NetworkResponse(statusCode: 200, data: {'data': category}),
      const NetworkResponse(statusCode: 204),
      const NetworkResponse(statusCode: 201, data: {'data': product}),
      const NetworkResponse(statusCode: 200, data: {'data': product}),
      const NetworkResponse(statusCode: 204),
      const NetworkResponse(statusCode: 201, data: {'data': variant}),
      const NetworkResponse(statusCode: 200, data: {'data': variant}),
      const NetworkResponse(statusCode: 204),
    ]);
    final repository = OnlineCatalogRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
      CatalogCacheRepository(database),
    );

    expect(
      (await repository.createCategory(name: 'Cables', slug: 'cables')).id,
      'category-1',
    );
    expect(
      (await repository.updateCategory(
        id: 'category-1',
        name: 'Cables',
        slug: 'cables',
      )).slug,
      'cables',
    );
    await repository.deleteCategory(id: 'category-1');
    expect(
      (await repository.createProduct(
        name: 'Cable',
        productType: 'PHYSICAL',
        isActive: true,
        categoryIds: ['category-1'],
      )).categoryIds,
      ['category-1'],
    );
    expect(
      (await repository.updateProduct(
        id: 'product-1',
        name: 'Cable',
        productType: 'PHYSICAL',
        isActive: true,
      )).name,
      'Cable',
    );
    await repository.deleteProduct(id: 'product-1');
    expect(
      (await repository.createVariant(
        productId: 'product-1',
        sku: 'CAB-1',
        name: 'Standard',
        baseUnitId: 'unit-1',
        isStockTracked: true,
      )).id,
      'variant-1',
    );
    expect(
      (await repository.updateVariant(
        id: 'variant-1',
        sku: 'CAB-1',
        name: 'Standard',
        baseUnitId: 'unit-1',
        isStockTracked: true,
      )).sku,
      'CAB-1',
    );
    await repository.deleteVariant(id: 'variant-1');
    expect(client.paths, [
      'POST /catalog/categories',
      'PATCH /catalog/categories/category-1',
      'DELETE /catalog/categories/category-1',
      'POST /catalog/products',
      'PATCH /catalog/products/product-1',
      'DELETE /catalog/products/product-1',
      'POST /catalog/products/product-1/variants',
      'PATCH /catalog/variants/variant-1',
      'DELETE /catalog/variants/variant-1',
    ]);
    final body = client.lastBody;
    expect(body, isNull);
    await database.closeForTest();
  });
}
