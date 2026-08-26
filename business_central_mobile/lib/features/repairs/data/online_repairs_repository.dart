import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/network/network_boundary.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../features/auth/data/online_auth_api.dart';
import '../../../core/database/local_canonical_record_repository.dart';
import '../application/repairs_repository.dart';
import 'local_repairs_repository.dart';
import '../domain/repair_models.dart';

class _OfflineRepairContext {
  const _OfflineRepairContext({
    required this.shopId,
    this.dependencyOperationId,
  });

  final String shopId;
  final String? dependencyOperationId;
}

class OnlineRepairsRepository implements RepairsRepository {
  OnlineRepairsRepository(
    this.api, {
    this.database,
    this.merchantId,
    this.actorMembershipId,
    this.queue,
  });
  final OnlineAuthApi api;
  final AppDatabase? database;
  final String? merchantId;
  final String? actorMembershipId;
  final SyncQueueWriter? queue;

  @override
  Future<List<RepairRecord>> list({required String shopId}) async => [
    for (final item in await api.getCollection(
      '/repairs/orders?page_index=0&page_size=100&filter=shop_id:${Uri.encodeQueryComponent(shopId)}',
    ))
      if (item['shop_id'] == shopId) RepairRecord.fromJson(item),
  ];

  @override
  Future<List<RepairFormField>> listFormDefinitions({
    required String shopId,
  }) async {
    final values = await api.getCollection(
      '/services/forms/definitions?page_index=0&page_size=200&filter=is_active:true',
    );
    final definitions = [
      for (final value in values) RepairFormField.fromJson(value),
    ];
    final localDatabase = database;
    final localMerchantId = merchantId;
    if (localDatabase != null && localMerchantId != null) {
      final cache = LocalCanonicalRecordRepository(
        database: localDatabase,
        merchantId: localMerchantId,
      );
      for (final definition in definitions) {
        await cache.put(
          entityType: 'SERVICE_FORM_DEFINITION',
          entityId: definition.id,
          payload: values.firstWhere((value) => value['id'] == definition.id),
        );
      }
    }
    return definitions;
  }

  @override
  Future<List<RepairWorkItem>> listWorkItems({
    required String repairOrderId,
  }) async => [
    for (final item in await api.getCollection(
      '/repairs/orders/$repairOrderId/work-items?page_index=0&page_size=100',
    ))
      RepairWorkItem.fromJson(item),
  ];

  @override
  Future<RepairWorkItem> updateWorkItem({
    required String repairOrderId,
    required String workItemId,
    required String status,
  }) async => RepairWorkItem.fromJson(
    await api.patchResource('/repairs/work-items/$workItemId', {
      'status': status.trim().toUpperCase(),
    }),
  );

  @override
  Future<List<RepairDiagnostic>> listDiagnostics({
    required String repairOrderId,
  }) async => [
    for (final item in await api.getCollection(
      '/repairs/orders/$repairOrderId/diagnostics?page_index=0&page_size=100',
    ))
      RepairDiagnostic.fromJson(item),
  ];

  @override
  Future<RepairDiagnostic> createDiagnostic({
    required String repairOrderId,
    required String diagnosis,
    String? estimatedCost,
    String? workItemId,
  }) async {
    final body = <String, Object?>{
      'repair_order_id': repairOrderId,
      if (workItemId != null && workItemId.trim().isNotEmpty)
        'work_item_id': workItemId.trim(),
      'diagnosis': diagnosis.trim(),
      if (estimatedCost != null && estimatedCost.trim().isNotEmpty)
        'estimated_cost': estimatedCost.trim(),
    };
    try {
      return RepairDiagnostic.fromJson(
        await api.postResource(
          '/repairs/orders/$repairOrderId/diagnostics',
          body,
        ),
      );
    } on Object catch (error) {
      if (!_isTransportFailure(error)) rethrow;
      final context = await _offlineRepairContext(repairOrderId);
      if (context == null) rethrow;
      final local =
          await LocalRepairsRepository(
            database: database!,
            merchantId: merchantId!,
            actorMembershipId: actorMembershipId,
          ).createDiagnostic(
            repairOrderId: repairOrderId,
            diagnosis: diagnosis,
            estimatedCost: estimatedCost,
            workItemId: workItemId,
          );
      await _enqueueChild(
        context: context,
        entityType: 'REPAIR_DIAGNOSTIC',
        entityId: local.id,
        payload: {'shop_id': context.shopId, ...body},
      );
      return local;
    }
  }

  @override
  Future<List<RepairPayment>> listPayments({
    required String repairOrderId,
  }) async => [
    for (final item in await api.getCollection(
      '/repairs/orders/$repairOrderId/payments?page_index=0&page_size=100',
    ))
      RepairPayment.fromJson(item),
  ];

  @override
  Future<RepairPayment> createPayment({
    required String repairOrderId,
    required String kind,
    required String method,
    required String amount,
  }) async {
    final idempotencyKey = Uuid().v4();
    final body = <String, Object?>{
      'kind': kind,
      'method': method,
      'amount': amount.trim(),
      'idempotency_key': idempotencyKey,
    };
    try {
      return RepairPayment.fromJson(
        await api.postResource('/repairs/orders/$repairOrderId/payments', body),
      );
    } on Object catch (error) {
      if (!_isTransportFailure(error) ||
          method.trim().toUpperCase() != 'CASH') {
        rethrow;
      }
      final context = await _offlineRepairContext(repairOrderId);
      if (context == null) rethrow;
      final local =
          await LocalRepairsRepository(
            database: database!,
            merchantId: merchantId!,
            actorMembershipId: actorMembershipId,
          ).createPayment(
            repairOrderId: repairOrderId,
            kind: kind,
            method: method,
            amount: amount,
          );
      await _enqueueChild(
        context: context,
        entityType: 'REPAIR_PAYMENT',
        entityId: local.id,
        payload: {
          'shop_id': context.shopId,
          'repair_order_id': repairOrderId,
          'kind': kind,
          'method': method,
          'amount': amount.trim(),
        },
      );
      return local;
    }
  }

  @override
  Future<List<RepairRefund>> listRefunds({
    required String repairOrderId,
  }) async {
    return [
      for (final item in await api.getCollection(
        '/repairs/orders/$repairOrderId/refunds?page_index=0&page_size=100',
      ))
        RepairRefund.fromJson(item),
    ];
  }

  @override
  Future<RepairRefund> createRefund({
    required String repairOrderId,
    required String paymentId,
    required String amount,
    String? reason,
    String? idempotencyKey,
  }) async => RepairRefund.fromJson(
    await api.postResource('/repairs/orders/$repairOrderId/refunds', {
      'payment_id': paymentId.trim(),
      'amount': amount.trim(),
      'idempotency_key': idempotencyKey?.trim().isNotEmpty == true
          ? idempotencyKey!.trim()
          : Uuid().v4(),
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    }),
  );

  @override
  Future<List<RepairImage>> listImages({required String repairOrderId}) async =>
      [
        for (final item in await api.getCollection(
          '/repairs/orders/$repairOrderId/images?page_index=0&page_size=100',
        ))
          RepairImage.fromJson(item),
      ];

  @override
  Future<RepairImage> createImage({
    required String repairOrderId,
    required String filename,
    required String contentType,
    required String dataBase64,
    String? workItemId,
  }) async {
    final body = <String, Object?>{
      'filename': filename.trim(),
      'content_type': contentType.trim(),
      'data_base64': dataBase64.trim(),
      if (workItemId != null && workItemId.trim().isNotEmpty)
        'work_item_id': workItemId.trim(),
    };
    try {
      return RepairImage.fromJson(
        await api.postResource('/repairs/orders/$repairOrderId/images', body),
      );
    } on Object catch (error) {
      if (!_isTransportFailure(error)) rethrow;
      final context = await _offlineRepairContext(repairOrderId);
      if (context == null) rethrow;
      final local =
          await LocalRepairsRepository(
            database: database!,
            merchantId: merchantId!,
            actorMembershipId: actorMembershipId,
          ).createImage(
            repairOrderId: repairOrderId,
            filename: filename,
            contentType: contentType,
            dataBase64: dataBase64,
            workItemId: workItemId,
          );
      await _enqueueChild(
        context: context,
        entityType: 'REPAIR_IMAGE',
        entityId: local.id,
        payload: {
          'shop_id': context.shopId,
          'repair_order_id': repairOrderId,
          ...body,
        },
      );
      return local;
    }
  }

  @override
  Future<void> deleteImage(String id) =>
      api.deleteResource('/repairs/images/$id');

  @override
  Future<List<RepairPart>> listParts({required String repairOrderId}) async => [
    for (final item in await api.getCollection(
      '/repairs/orders/$repairOrderId/parts?page_index=0&page_size=100',
    ))
      RepairPart.fromJson(item),
  ];

  @override
  Future<RepairPart> createPart({
    required String repairOrderId,
    String? variantId,
    String? customerSuppliedPartId,
    required String quantity,
    required String unitPrice,
    String status = 'USED',
    String? promotionId,
    String? workItemId,
  }) async {
    final body = <String, Object?>{
      if (variantId != null && variantId.trim().isNotEmpty)
        'variant_id': variantId.trim(),
      if (customerSuppliedPartId != null &&
          customerSuppliedPartId.trim().isNotEmpty)
        'customer_supplied_part_id': customerSuppliedPartId.trim(),
      'quantity': quantity.trim(),
      'unit_price': unitPrice.trim(),
      'status': status.trim(),
      if (promotionId != null && promotionId.trim().isNotEmpty)
        'promotion_id': promotionId.trim(),
      if (workItemId != null && workItemId.trim().isNotEmpty)
        'work_item_id': workItemId.trim(),
    };
    try {
      return RepairPart.fromJson(
        await api.postResource('/repairs/orders/$repairOrderId/parts', body),
      );
    } on Object catch (error) {
      if (!_isTransportFailure(error)) rethrow;
      final context = await _offlineRepairContext(repairOrderId);
      if (context == null) rethrow;
      final local =
          await LocalRepairsRepository(
            database: database!,
            merchantId: merchantId!,
            actorMembershipId: actorMembershipId,
          ).createPart(
            repairOrderId: repairOrderId,
            variantId: variantId,
            customerSuppliedPartId: customerSuppliedPartId,
            quantity: quantity,
            unitPrice: unitPrice,
            status: status,
            promotionId: promotionId,
            workItemId: workItemId,
          );
      await _enqueueChild(
        context: context,
        entityType: 'REPAIR_PART',
        entityId: local.id,
        payload: {
          'shop_id': context.shopId,
          'repair_order_id': repairOrderId,
          ...body,
        },
      );
      return local;
    }
  }

  @override
  Future<RepairPart> updatePart({
    required String id,
    String? variantId,
    String? customerSuppliedPartId,
    required String quantity,
    required String unitPrice,
    required String status,
    String? promotionId,
  }) async => RepairPart.fromJson(
    await api.patchResource('/repairs/parts/$id', {
      if (variantId != null && variantId.trim().isNotEmpty)
        'variant_id': variantId.trim(),
      if (customerSuppliedPartId != null &&
          customerSuppliedPartId.trim().isNotEmpty)
        'customer_supplied_part_id': customerSuppliedPartId.trim(),
      'quantity': quantity.trim(),
      'unit_price': unitPrice.trim(),
      'status': status.trim(),
      if (promotionId != null && promotionId.trim().isNotEmpty)
        'promotion_id': promotionId.trim(),
    }),
  );

  @override
  Future<void> deletePart(String id) =>
      api.deleteResource('/repairs/parts/$id');

  @override
  Future<List<RepairApproval>> listApprovals({
    required String repairOrderId,
  }) async => [
    for (final item in await api.getCollection(
      '/repairs/orders/$repairOrderId/approvals?page_index=0&page_size=100',
    ))
      RepairApproval.fromJson(item),
  ];

  @override
  Future<RepairApproval> createApproval({
    required String repairOrderId,
    required int approvalVersion,
    required String status,
    String? approvedAmount,
    DateTime? approvedAt,
    String? workItemId,
  }) async {
    final body = <String, Object?>{
      'approval_version': approvalVersion,
      'status': status.trim(),
      if (approvedAmount != null && approvedAmount.trim().isNotEmpty)
        'approved_amount': approvedAmount.trim(),
      if (approvedAt != null)
        'approved_at': approvedAt.toUtc().toIso8601String(),
      if (workItemId != null && workItemId.trim().isNotEmpty)
        'work_item_id': workItemId.trim(),
    };
    try {
      return RepairApproval.fromJson(
        await api.postResource(
          '/repairs/orders/$repairOrderId/approvals',
          body,
        ),
      );
    } on Object catch (error) {
      if (!_isTransportFailure(error)) rethrow;
      final context = await _offlineRepairContext(repairOrderId);
      if (context == null) rethrow;
      final local =
          await LocalRepairsRepository(
            database: database!,
            merchantId: merchantId!,
            actorMembershipId: actorMembershipId,
          ).createApproval(
            repairOrderId: repairOrderId,
            approvalVersion: approvalVersion,
            status: status,
            approvedAmount: approvedAmount,
            approvedAt: approvedAt,
            workItemId: workItemId,
          );
      await _enqueueChild(
        context: context,
        entityType: 'REPAIR_APPROVAL',
        entityId: local.id,
        payload: {
          'shop_id': context.shopId,
          'repair_order_id': repairOrderId,
          ...body,
        },
      );
      return local;
    }
  }

  @override
  Future<RepairApproval> updateApproval({
    required String id,
    required String repairOrderId,
    required int approvalVersion,
    required String status,
    String? approvedAmount,
    DateTime? approvedAt,
  }) async => RepairApproval.fromJson(
    await api.patchResource('/repairs/approvals/$id', {
      'repair_order_id': repairOrderId,
      'approval_version': approvalVersion,
      'status': status.trim(),
      if (approvedAmount != null && approvedAmount.trim().isNotEmpty)
        'approved_amount': approvedAmount.trim(),
      if (approvedAt != null)
        'approved_at': approvedAt.toUtc().toIso8601String(),
    }),
  );

  @override
  Future<void> deleteApproval(String id) =>
      api.deleteResource('/repairs/approvals/$id');

  @override
  Future<List<RepairWarranty>> listWarranties({
    required String repairOrderId,
  }) async => [
    for (final item in await api.getCollection(
      '/repairs/orders/$repairOrderId/warranties?page_index=0&page_size=100',
    ))
      RepairWarranty.fromJson(item),
  ];

  @override
  Future<RepairWarranty> createWarranty({
    required String repairOrderId,
    required DateTime startsAt,
    required DateTime endsAt,
    String? terms,
    String? workItemId,
  }) async {
    final body = <String, Object?>{
      'starts_at': startsAt.toUtc().toIso8601String(),
      'ends_at': endsAt.toUtc().toIso8601String(),
      if (terms != null && terms.trim().isNotEmpty) 'terms': terms.trim(),
      if (workItemId != null && workItemId.trim().isNotEmpty)
        'work_item_id': workItemId.trim(),
    };
    try {
      return RepairWarranty.fromJson(
        await api.postResource(
          '/repairs/orders/$repairOrderId/warranties',
          body,
        ),
      );
    } on Object catch (error) {
      if (!_isTransportFailure(error)) rethrow;
      final context = await _offlineRepairContext(repairOrderId);
      if (context == null) rethrow;
      final local =
          await LocalRepairsRepository(
            database: database!,
            merchantId: merchantId!,
            actorMembershipId: actorMembershipId,
          ).createWarranty(
            repairOrderId: repairOrderId,
            startsAt: startsAt,
            endsAt: endsAt,
            terms: terms,
            workItemId: workItemId,
          );
      await _enqueueChild(
        context: context,
        entityType: 'REPAIR_WARRANTY',
        entityId: local.id,
        payload: {
          'shop_id': context.shopId,
          'repair_order_id': repairOrderId,
          ...body,
        },
      );
      return local;
    }
  }

  @override
  Future<RepairWarranty> updateWarranty({
    required String id,
    required String repairOrderId,
    required DateTime startsAt,
    required DateTime endsAt,
    String? terms,
  }) async => RepairWarranty.fromJson(
    await api.patchResource('/repairs/warranties/$id', {
      'repair_order_id': repairOrderId,
      'starts_at': startsAt.toUtc().toIso8601String(),
      'ends_at': endsAt.toUtc().toIso8601String(),
      if (terms != null && terms.trim().isNotEmpty) 'terms': terms.trim(),
    }),
  );

  @override
  Future<void> deleteWarranty(String id) =>
      api.deleteResource('/repairs/warranties/$id');

  @override
  Future<void> updateStatus({
    required RepairRecord repair,
    required String status,
  }) async {
    final serviceOrderId = repair.serviceOrderId;
    final deviceId = repair.deviceId;
    if (serviceOrderId == null || deviceId == null) {
      throw StateError('Repair record is missing lifecycle scope.');
    }
    await api.patchResource('/repairs/orders/${repair.id}', {
      'service_order_id': serviceOrderId,
      'device_id': deviceId,
      'order_number': repair.orderNumber,
      'status': status,
      'issue_description': repair.issueDescription,
      'received_at': repair.receivedAt.toUtc().toIso8601String(),
      if (status == 'COMPLETED')
        'completed_at': DateTime.now().toUtc().toIso8601String(),
    });
  }

  @override
  Future<RepairTicketResult> createTicket({
    required String shopId,
    required String orderNumber,
    required String deviceType,
    required String issueDescription,
    String? manufacturer,
    String? model,
    String? serialNumber,
    String? priority,
    String? customerName,
    String? customerPhone,
    String? additionalFee,
    String? note,
    List<RepairWorkItemInput>? workItems,
    Map<String, Object?>? ticketFields,
  }) async {
    final idempotencyKey = Uuid().v4();
    final requestedWorkItems =
        workItems ??
        [
          RepairWorkItemInput(
            deviceType: deviceType,
            issueDescription: issueDescription,
            manufacturer: manufacturer,
            model: model,
            serialNumber: serialNumber,
            note: note,
          ),
        ];
    final effectiveWorkItems = [
      for (var index = 0; index < requestedWorkItems.length; index++)
        requestedWorkItems[index].id?.trim().isNotEmpty == true
            ? requestedWorkItems[index]
            : requestedWorkItems[index].withId(Uuid().v4()),
    ];
    final payload = <String, Object?>{
      'idempotency_key': idempotencyKey,
      'order_number': orderNumber,
      'shop_id': shopId,
      'issue_description': issueDescription.trim(),
      'device': {
        'device_type': deviceType.trim(),
        if (manufacturer != null && manufacturer.trim().isNotEmpty)
          'manufacturer': manufacturer.trim(),
        if (model != null && model.trim().isNotEmpty) 'model': model.trim(),
        if (serialNumber != null && serialNumber.trim().isNotEmpty)
          'serial_number': serialNumber.trim(),
      },
      if (effectiveWorkItems.isNotEmpty)
        'work_items': [for (final item in effectiveWorkItems) item.toJson()],
      if (ticketFields != null && ticketFields.isNotEmpty)
        'fields': ticketFields,
      if (priority != null && priority.trim().isNotEmpty)
        'priority': priority.trim(),
      if (customerName != null && customerName.trim().isNotEmpty)
        'customer_name': customerName.trim(),
      if (customerPhone != null && customerPhone.trim().isNotEmpty)
        'customer_phone': customerPhone.trim(),
      if (additionalFee != null && additionalFee.trim().isNotEmpty)
        'additional_fee': additionalFee.trim(),
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
    };
    try {
      return RepairTicketResult.fromJson(
        await api.postResource('/repairs/tickets', payload),
      );
    } on Object catch (error) {
      final localDatabase = database;
      final localMerchantId = merchantId;
      final localQueue = queue;
      if (!_isTransportFailure(error) ||
          localDatabase == null ||
          localMerchantId == null ||
          localQueue == null) {
        rethrow;
      }
      final local = LocalRepairsRepository(
        database: localDatabase,
        merchantId: localMerchantId,
        actorMembershipId: actorMembershipId,
      );
      final result = await local.createTicket(
        shopId: shopId,
        orderNumber: orderNumber,
        deviceType: deviceType,
        issueDescription: issueDescription,
        manufacturer: manufacturer,
        model: model,
        serialNumber: serialNumber,
        priority: priority,
        customerName: customerName,
        customerPhone: customerPhone,
        additionalFee: additionalFee,
        note: note,
        workItems: effectiveWorkItems,
        ticketFields: ticketFields,
      );
      final deviceIdentifier = await localQueue.deviceIdentifier();
      await localQueue.enqueue(
        operationId: localQueue.operationId(),
        merchantId: localMerchantId,
        shopId: shopId,
        deviceId: deviceIdentifier,
        entityType: 'REPAIR_TICKET',
        entityId: result.repairOrderId,
        operationType: 'CREATE',
        payload: {
          ...payload,
          'ticket_id': result.repairOrderId,
          'offline_source': true,
        },
      );
      return result;
    }
  }

  bool _isTransportFailure(Object error) =>
      error is NetworkDeniedException || error is DioException;

  Future<_OfflineRepairContext?> _offlineRepairContext(
    String repairOrderId,
  ) async {
    final localDatabase = database;
    final localMerchantId = merchantId;
    if (localDatabase == null || localMerchantId == null) return null;
    final parent =
        await (localDatabase.select(localDatabase.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(localMerchantId) &
                  row.id.equals(repairOrderId) &
                  row.recordType.equals('REPAIR'),
            ))
            .getSingleOrNull();
    if (parent == null) return null;
    final queuedParent = await localDatabase.operationForEntity(
      merchantId: localMerchantId,
      entityType: 'REPAIR_TICKET',
      entityId: repairOrderId,
      operationType: 'CREATE',
    );
    return _OfflineRepairContext(
      shopId: parent.shopId,
      dependencyOperationId:
          queuedParent == null || queuedParent.status == 'SYNCED'
          ? null
          : queuedParent.operationId,
    );
  }

  Future<void> _enqueueChild({
    required _OfflineRepairContext context,
    required String entityType,
    required String entityId,
    required Map<String, Object?> payload,
  }) async {
    final localDatabase = database;
    final localMerchantId = merchantId;
    final localQueue = queue;
    if (localDatabase == null ||
        localMerchantId == null ||
        localQueue == null) {
      throw StateError('Offline repair synchronization is not configured.');
    }
    final deviceIdentifier = await localQueue.deviceIdentifier();
    await localQueue.enqueue(
      operationId: localQueue.operationId(),
      merchantId: localMerchantId,
      shopId: context.shopId,
      deviceId: deviceIdentifier,
      entityType: entityType,
      entityId: entityId,
      operationType: 'CREATE',
      baseVersion: 0,
      dependencyOperationId: context.dependencyOperationId,
      payload: payload,
    );
  }
}
