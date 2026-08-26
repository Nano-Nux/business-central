import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/services/data/online_services_repository.dart';

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
  test('service catalog and orders preserve selected-shop scope', () async {
    final client = _Client([
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'service-1',
              'merchant_id': 'merchant-1',
              'code': 'SCREEN',
              'name': 'Screen replacement',
              'labor_fee': '20.00',
              'is_active': true,
            },
          ],
        },
      ),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'service-2',
            'merchant_id': 'merchant-1',
            'code': 'BATTERY',
            'name': 'Battery replacement',
            'labor_fee': '15.00',
            'is_active': true,
          },
        },
      ),
      const NetworkResponse(statusCode: 204),
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'order-1',
              'merchant_id': 'merchant-1',
              'shop_id': 'shop-1',
              'order_number': 'SVC-1',
              'service_type': 'REPAIR',
              'status': 'OPEN',
              'priority': 'NORMAL',
              'opened_at': '2026-08-05T10:00:00Z',
            },
            {
              'id': 'order-2',
              'merchant_id': 'merchant-1',
              'shop_id': 'shop-2',
              'order_number': 'SVC-2',
              'service_type': 'OTHER',
              'status': 'OPEN',
              'priority': 'LOW',
              'opened_at': '2026-08-05T10:00:00Z',
            },
          ],
        },
      ),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'order-3',
            'merchant_id': 'merchant-1',
            'shop_id': 'shop-1',
            'order_number': 'SVC-3',
            'service_type': 'REPAIR',
            'status': 'OPEN',
            'priority': 'HIGH',
            'opened_at': '2026-08-05T10:00:00Z',
          },
        },
      ),
      const NetworkResponse(statusCode: 200, data: {'data': []}),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'item-1',
            'service_order_id': 'order-1',
            'service_id': 'service-1',
            'description': 'Screen replacement',
            'quantity': '1',
            'unit_price': '20.00',
            'status': 'OPEN',
          },
        },
      ),
    ]);
    final repository = OnlineServicesRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
    );

    expect((await repository.listCatalog()).single.code, 'SCREEN');
    expect(
      (await repository.createDefinition(
        code: 'BATTERY',
        name: 'Battery replacement',
        laborFee: '15.00',
      )).id,
      'service-2',
    );
    await repository.deleteDefinition(id: 'service-2');
    expect(
      (await repository.listOrders(shopId: 'shop-1')).single.id,
      'order-1',
    );
    expect(
      (await repository.createOrder(
        shopId: 'shop-1',
        orderNumber: 'SVC-3',
        serviceType: 'REPAIR',
        priority: 'HIGH',
      )).id,
      'order-3',
    );
    expect(await repository.listItems(orderId: 'order-1'), isEmpty);
    expect(
      (await repository.createItem(
        orderId: 'order-1',
        serviceId: 'service-1',
        description: 'Screen replacement',
        quantity: '1',
        unitPrice: '20.00',
      )).id,
      'item-1',
    );
    expect(client.paths, [
      'GET /services/catalog?page_index=0&page_size=100',
      'POST /services/catalog',
      'DELETE /services/catalog/service-2',
      'GET /services/orders?page_index=0&page_size=100',
      'POST /services/orders',
      'GET /services/orders/order-1/items?page_index=0&page_size=100',
      'POST /services/orders/order-1/items',
    ]);
  });

  test('service order follow-up routes preserve the parent order', () async {
    final client = _Client([
      const NetworkResponse(statusCode: 200, data: {'data': []}),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'appointment-1',
            'service_order_id': 'order-1',
            'starts_at': '2026-08-05T10:00:00Z',
            'ends_at': '2026-08-05T11:00:00Z',
            'status': 'SCHEDULED',
          },
        },
      ),
      const NetworkResponse(statusCode: 200, data: {'data': []}),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'note-1',
            'service_order_id': 'order-1',
            'note': 'Customer contacted',
            'created_at': '2026-08-05T10:00:00Z',
          },
        },
      ),
      const NetworkResponse(statusCode: 200, data: {'data': []}),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'id': 'billing-1',
            'service_order_id': 'order-1',
            'amount': '20.00',
            'status': 'PENDING',
          },
        },
      ),
    ]);
    final repository = OnlineServicesRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
    );

    expect(await repository.listAppointments(orderId: 'order-1'), isEmpty);
    expect(
      (await repository.createAppointment(
        orderId: 'order-1',
        startsAt: DateTime.utc(2026, 8, 5, 10),
        endsAt: DateTime.utc(2026, 8, 5, 11),
        status: 'SCHEDULED',
      )).id,
      'appointment-1',
    );
    expect(await repository.listNotes(orderId: 'order-1'), isEmpty);
    expect(
      (await repository.createNote(
        orderId: 'order-1',
        note: 'Customer contacted',
      )).id,
      'note-1',
    );
    expect(await repository.listBillings(orderId: 'order-1'), isEmpty);
    expect(
      (await repository.createBilling(
        orderId: 'order-1',
        amount: '20.00',
        status: 'PENDING',
      )).id,
      'billing-1',
    );
    expect(client.paths, [
      'GET /services/orders/order-1/appointments?page_index=0&page_size=100',
      'POST /services/orders/order-1/appointments',
      'GET /services/orders/order-1/notes?page_index=0&page_size=100',
      'POST /services/orders/order-1/notes',
      'GET /services/orders/order-1/billings?page_index=0&page_size=100',
      'POST /services/orders/order-1/billings',
    ]);
  });

  test('service update and delete routes match the backend contract', () async {
    final client = _Client([
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': {
            'id': 'service-1',
            'merchant_id': 'merchant-1',
            'code': 'SCREEN',
            'name': 'Screen',
            'labor_fee': '25.00',
            'is_active': true,
          },
        },
      ),
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': {
            'id': 'order-1',
            'merchant_id': 'merchant-1',
            'shop_id': 'shop-1',
            'order_number': 'SVC-1',
            'service_type': 'REPAIR',
            'status': 'COMPLETED',
            'priority': 'HIGH',
            'opened_at': '2026-08-05T10:00:00Z',
          },
        },
      ),
      const NetworkResponse(statusCode: 204),
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': {
            'id': 'item-1',
            'service_order_id': 'order-1',
            'service_id': 'service-1',
            'description': 'Screen',
            'quantity': '2',
            'unit_price': '25.00',
            'status': 'OPEN',
          },
        },
      ),
      const NetworkResponse(statusCode: 204),
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': {
            'id': 'appointment-1',
            'service_order_id': 'order-1',
            'starts_at': '2026-08-05T10:00:00Z',
            'ends_at': '2026-08-05T11:00:00Z',
            'status': 'DONE',
          },
        },
      ),
      const NetworkResponse(statusCode: 204),
      const NetworkResponse(statusCode: 204),
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': {
            'id': 'billing-1',
            'service_order_id': 'order-1',
            'amount': '25.00',
            'status': 'PAID',
          },
        },
      ),
      const NetworkResponse(statusCode: 204),
    ]);
    final repository = OnlineServicesRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
    );
    expect(
      (await repository.updateDefinition(
        id: 'service-1',
        code: 'SCREEN',
        name: 'Screen',
        laborFee: '25.00',
      )).laborFee,
      '25.00',
    );
    expect(
      (await repository.updateOrder(
        id: 'order-1',
        shopId: 'shop-1',
        orderNumber: 'SVC-1',
        serviceType: 'REPAIR',
        status: 'COMPLETED',
        priority: 'HIGH',
      )).status,
      'COMPLETED',
    );
    await repository.deleteOrder(id: 'order-1');
    expect(
      (await repository.updateItem(
        id: 'item-1',
        orderId: 'order-1',
        serviceId: 'service-1',
        description: 'Screen',
        quantity: '2',
        unitPrice: '25.00',
        status: 'OPEN',
      )).quantity,
      '2',
    );
    await repository.deleteItem(id: 'item-1');
    expect(
      (await repository.updateAppointment(
        id: 'appointment-1',
        orderId: 'order-1',
        startsAt: DateTime.utc(2026, 8, 5, 10),
        endsAt: DateTime.utc(2026, 8, 5, 11),
        status: 'DONE',
      )).status,
      'DONE',
    );
    await repository.deleteAppointment(id: 'appointment-1');
    await repository.deleteNote(id: 'note-1');
    expect(
      (await repository.updateBilling(
        id: 'billing-1',
        orderId: 'order-1',
        amount: '25.00',
        status: 'PAID',
      )).status,
      'PAID',
    );
    await repository.deleteBilling(id: 'billing-1');
    expect(client.paths, [
      'PATCH /services/catalog/service-1',
      'PATCH /services/orders/order-1',
      'DELETE /services/orders/order-1',
      'PATCH /services/items/item-1',
      'DELETE /services/items/item-1',
      'PATCH /services/appointments/appointment-1',
      'DELETE /services/appointments/appointment-1',
      'DELETE /services/notes/note-1',
      'PATCH /services/billings/billing-1',
      'DELETE /services/billings/billing-1',
    ]);
  });
}
