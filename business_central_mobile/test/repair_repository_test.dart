import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/secure_session_store.dart';
import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/repairs/data/online_repairs_repository.dart';
import 'package:business_central_mobile/features/repairs/domain/repair_models.dart';

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
    'online work-item reads preserve the shared aggregate contract',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'work-1',
                'service_order_id': 'service-1',
                'sequence_number': 1,
                'type': 'DEVICE',
                'status': 'OPEN',
                'form_version': 2,
                'device': {'device_type': 'PHONE', 'model': 'X1'},
                'issue_description': 'Screen issue',
                'fields': {'colour': 'black'},
              },
            ],
          },
        ),
      ]);
      final repository = OnlineRepairsRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );
      final items = await repository.listWorkItems(repairOrderId: 'repair-1');
      expect(items.single.id, 'work-1');
      expect(items.single.formVersion, 2);
      expect(items.single.fields['colour'], 'black');
      expect(client.paths, [
        'GET /repairs/orders/repair-1/work-items?page_index=0&page_size=100',
      ]);
    },
  );

  test('repair list and atomic ticket intake preserve shop scope', () async {
    final client = _Client([
      const NetworkResponse(
        statusCode: 200,
        data: {
          'data': [
            {
              'id': 'repair-1',
              'shop_id': 'shop-1',
              'order_number': 'REP-1',
              'status': 'RECEIVED',
              'issue_description': 'Screen issue',
              'received_at': '2026-08-05T10:00:00Z',
              'payment_status': 'UNPAID',
              'total_cost': '0.00',
            },
            {
              'id': 'repair-2',
              'shop_id': 'shop-2',
              'order_number': 'REP-2',
              'status': 'RECEIVED',
              'issue_description': 'Other shop',
              'received_at': '2026-08-05T10:00:00Z',
              'payment_status': 'UNPAID',
              'total_cost': '0.00',
            },
          ],
        },
      ),
      const NetworkResponse(
        statusCode: 201,
        data: {
          'data': {
            'repair_order': {'id': 'repair-3', 'order_number': 'REP-3'},
          },
        },
      ),
    ]);
    final repository = OnlineRepairsRepository(
      OnlineAuthApi(client: client, sessionStore: _Store()),
    );

    final repairs = await repository.list(shopId: 'shop-1');
    expect(repairs.single.orderNumber, 'REP-1');
    final result = await repository.createTicket(
      shopId: 'shop-1',
      orderNumber: 'REP-3',
      deviceType: 'Phone',
      issueDescription: 'Broken screen',
      customerName: 'Ada',
      additionalFee: '0.00',
      workItems: const [
        RepairWorkItemInput(
          deviceType: 'Phone',
          issueDescription: 'Broken screen',
        ),
        RepairWorkItemInput(
          deviceType: 'Tablet',
          issueDescription: 'Tablet battery issue',
        ),
      ],
    );
    expect(result.repairOrderId, 'repair-3');
    expect(client.paths, [
      'GET /repairs/orders?page_index=0&page_size=100&filter=shop_id:shop-1',
      'POST /repairs/tickets',
    ]);
    final body = client.lastBody! as Map<String, Object?>;
    expect(body['shop_id'], 'shop-1');
    expect(body['idempotency_key'], isA<String>());
    expect((body['device'] as Map<String, Object?>)['device_type'], 'Phone');
    expect((body['work_items'] as List<Object?>).length, 2);
    expect(
      ((body['work_items'] as List<Object?>)[1]
          as Map<String, Object?>)['issue_description'],
      'Tablet battery issue',
    );
  });

  test(
    'repair follow-up routes keep lifecycle and payment contracts',
    () async {
      final client = _Client([
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': [
              {
                'id': 'diagnostic-1',
                'repair_order_id': 'repair-1',
                'diagnosis': 'Needs a replacement screen',
                'estimated_cost': '25.00',
                'created_at': '2026-08-05T10:00:00Z',
              },
            ],
          },
        ),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'diagnostic-2',
              'repair_order_id': 'repair-1',
              'diagnosis': 'Screen replacement approved',
              'created_at': '2026-08-05T10:01:00Z',
            },
          },
        ),
        const NetworkResponse(statusCode: 200, data: {'data': []}),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'payment-1',
              'repair_order_id': 'repair-1',
              'kind': 'FINAL',
              'method': 'CARD',
              'status': 'CAPTURED',
              'amount': '25.00',
              'created_at': '2026-08-05T10:02:00Z',
            },
          },
        ),
        const NetworkResponse(statusCode: 200, data: {'data': []}),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'refund-1',
              'repair_order_id': 'repair-1',
              'payment_id': 'payment-1',
              'status': 'SUCCEEDED',
              'amount': '5.00',
              'reason': 'Repair refund',
              'created_at': '2026-08-05T10:03:00Z',
            },
          },
        ),
        const NetworkResponse(statusCode: 200, data: {'data': {}}),
      ]);
      final repository = OnlineRepairsRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );

      final diagnostics = await repository.listDiagnostics(
        repairOrderId: 'repair-1',
      );
      expect(diagnostics.single.estimatedCost, '25.00');
      final diagnostic = await repository.createDiagnostic(
        repairOrderId: 'repair-1',
        diagnosis: 'Screen replacement approved',
      );
      expect(diagnostic.id, 'diagnostic-2');
      final payments = await repository.listPayments(repairOrderId: 'repair-1');
      expect(payments, isEmpty);
      final payment = await repository.createPayment(
        repairOrderId: 'repair-1',
        kind: 'FINAL',
        method: 'CARD',
        amount: '25.00',
      );
      expect(payment.status, 'CAPTURED');
      final paymentBody = client.lastBody! as Map<String, Object?>;
      expect(paymentBody['kind'], 'FINAL');
      expect(paymentBody['method'], 'CARD');
      expect(paymentBody['idempotency_key'], isA<String>());
      expect(await repository.listRefunds(repairOrderId: 'repair-1'), isEmpty);
      final refund = await repository.createRefund(
        repairOrderId: 'repair-1',
        paymentId: 'payment-1',
        amount: '5.00',
        reason: 'Repair refund',
        idempotencyKey: 'repair-refund-1',
      );
      expect(refund.id, 'refund-1');
      expect(client.lastBody, {
        'payment_id': 'payment-1',
        'amount': '5.00',
        'idempotency_key': 'repair-refund-1',
        'reason': 'Repair refund',
      });

      await repository.updateStatus(
        repair: RepairRecord(
          id: 'repair-1',
          orderNumber: 'REP-1',
          shopId: 'shop-1',
          status: 'RECEIVED',
          issueDescription: 'Screen issue',
          receivedAt: DateTime.utc(2026, 8, 5, 10),
          paymentStatus: 'UNPAID',
          totalCost: '25.00',
          serviceOrderId: 'service-1',
          deviceId: 'device-1',
        ),
        status: 'IN_PROGRESS',
      );
      expect(client.paths, [
        'GET /repairs/orders/repair-1/diagnostics?page_index=0&page_size=100',
        'POST /repairs/orders/repair-1/diagnostics',
        'GET /repairs/orders/repair-1/payments?page_index=0&page_size=100',
        'POST /repairs/orders/repair-1/payments',
        'GET /repairs/orders/repair-1/refunds?page_index=0&page_size=100',
        'POST /repairs/orders/repair-1/refunds',
        'PATCH /repairs/orders/repair-1',
      ]);
      final statusBody = client.lastBody! as Map<String, Object?>;
      expect(statusBody['service_order_id'], 'service-1');
      expect(statusBody['device_id'], 'device-1');
      expect(statusBody['status'], 'IN_PROGRESS');
    },
  );

  test(
    'repair parts, images, approvals, and warranties use canonical routes',
    () async {
      final client = _Client([
        const NetworkResponse(statusCode: 200, data: {'data': []}),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'image-1',
              'repair_order_id': 'repair-1',
              'filename': 'screen.jpg',
              'content_type': 'image/jpeg',
              'created_at': '2026-08-05T10:00:00Z',
            },
          },
        ),
        const NetworkResponse(statusCode: 204),
        const NetworkResponse(statusCode: 200, data: {'data': []}),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'part-1',
              'repair_order_id': 'repair-1',
              'variant_id': 'variant-1',
              'quantity': '1',
              'unit_price': '25.00',
              'status': 'USED',
            },
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'id': 'part-1',
              'repair_order_id': 'repair-1',
              'variant_id': 'variant-1',
              'quantity': '2',
              'unit_price': '24.00',
              'status': 'USED',
            },
          },
        ),
        const NetworkResponse(statusCode: 204),
        const NetworkResponse(statusCode: 200, data: {'data': []}),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'approval-1',
              'repair_order_id': 'repair-1',
              'approval_version': 1,
              'status': 'APPROVED',
              'approved_amount': '25.00',
              'created_at': '2026-08-05T10:00:00Z',
            },
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'id': 'approval-1',
              'repair_order_id': 'repair-1',
              'approval_version': 2,
              'status': 'REJECTED',
              'created_at': '2026-08-05T10:01:00Z',
            },
          },
        ),
        const NetworkResponse(statusCode: 204),
        const NetworkResponse(statusCode: 200, data: {'data': []}),
        const NetworkResponse(
          statusCode: 201,
          data: {
            'data': {
              'id': 'warranty-1',
              'repair_order_id': 'repair-1',
              'starts_at': '2026-08-05T00:00:00Z',
              'ends_at': '2026-09-05T00:00:00Z',
              'terms': '30 days',
            },
          },
        ),
        const NetworkResponse(
          statusCode: 200,
          data: {
            'data': {
              'id': 'warranty-1',
              'repair_order_id': 'repair-1',
              'starts_at': '2026-08-05T00:00:00Z',
              'ends_at': '2026-10-05T00:00:00Z',
              'terms': '60 days',
            },
          },
        ),
        const NetworkResponse(statusCode: 204),
      ]);
      final repository = OnlineRepairsRepository(
        OnlineAuthApi(client: client, sessionStore: _Store()),
      );
      final start = DateTime.utc(2026, 8, 5);
      final end = DateTime.utc(2026, 9, 5);

      expect(await repository.listImages(repairOrderId: 'repair-1'), isEmpty);
      expect(
        (await repository.createImage(
          repairOrderId: 'repair-1',
          filename: 'screen.jpg',
          contentType: 'image/jpeg',
          dataBase64: 'AA==',
        )).id,
        'image-1',
      );
      await repository.deleteImage('image-1');
      expect(await repository.listParts(repairOrderId: 'repair-1'), isEmpty);
      expect(
        (await repository.createPart(
          repairOrderId: 'repair-1',
          variantId: 'variant-1',
          quantity: '1',
          unitPrice: '25.00',
        )).id,
        'part-1',
      );
      expect(
        (await repository.updatePart(
          id: 'part-1',
          quantity: '2',
          unitPrice: '24.00',
          status: 'USED',
        )).quantity,
        '2',
      );
      await repository.deletePart('part-1');
      expect(
        await repository.listApprovals(repairOrderId: 'repair-1'),
        isEmpty,
      );
      expect(
        (await repository.createApproval(
          repairOrderId: 'repair-1',
          approvalVersion: 1,
          status: 'APPROVED',
          approvedAmount: '25.00',
        )).status,
        'APPROVED',
      );
      expect(
        (await repository.updateApproval(
          id: 'approval-1',
          repairOrderId: 'repair-1',
          approvalVersion: 2,
          status: 'REJECTED',
        )).approvalVersion,
        2,
      );
      await repository.deleteApproval('approval-1');
      expect(
        await repository.listWarranties(repairOrderId: 'repair-1'),
        isEmpty,
      );
      expect(
        (await repository.createWarranty(
          repairOrderId: 'repair-1',
          startsAt: start,
          endsAt: end,
          terms: '30 days',
        )).terms,
        '30 days',
      );
      expect(
        (await repository.updateWarranty(
          id: 'warranty-1',
          repairOrderId: 'repair-1',
          startsAt: start,
          endsAt: DateTime.utc(2026, 10, 5),
          terms: '60 days',
        )).endsAt,
        DateTime.utc(2026, 10, 5),
      );
      await repository.deleteWarranty('warranty-1');
      expect(client.paths, [
        'GET /repairs/orders/repair-1/images?page_index=0&page_size=100',
        'POST /repairs/orders/repair-1/images',
        'DELETE /repairs/images/image-1',
        'GET /repairs/orders/repair-1/parts?page_index=0&page_size=100',
        'POST /repairs/orders/repair-1/parts',
        'PATCH /repairs/parts/part-1',
        'DELETE /repairs/parts/part-1',
        'GET /repairs/orders/repair-1/approvals?page_index=0&page_size=100',
        'POST /repairs/orders/repair-1/approvals',
        'PATCH /repairs/approvals/approval-1',
        'DELETE /repairs/approvals/approval-1',
        'GET /repairs/orders/repair-1/warranties?page_index=0&page_size=100',
        'POST /repairs/orders/repair-1/warranties',
        'PATCH /repairs/warranties/warranty-1',
        'DELETE /repairs/warranties/warranty-1',
      ]);
    },
  );
}
