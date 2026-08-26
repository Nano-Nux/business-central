import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';
import '../../../core/database/local_canonical_record_repository.dart';
import '../../../shared/money.dart';
import '../../inventory/data/local_inventory_repository.dart';
import '../application/repairs_repository.dart';
import '../domain/repair_models.dart';

/// Standalone local repair records used only by FULLY_OFFLINE mode.
///
/// Local payments are ledger entries for the local repair record. They do not
/// capture an external payment and are not treated as backend reconciliation.
class LocalRepairsRepository implements RepairsRepository {
  LocalRepairsRepository({
    required this.database,
    required this.merchantId,
    this.actorMembershipId,
  });

  final AppDatabase database;
  final String merchantId;
  final String? actorMembershipId;
  static const _uuid = Uuid();
  static const _repairStatuses = {
    'RECEIVED',
    'IN_PROGRESS',
    'READY_FOR_PICKUP',
    'COMPLETED',
    'REFUNDED',
  };

  @override
  Future<List<RepairRecord>> list({required String shopId}) async {
    final rows =
        await (database.select(database.localRepairRecords)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.shopId.equals(shopId) &
                    row.recordType.equals('REPAIR'),
              )
              ..orderBy([(row) => OrderingTerm.desc(row.createdAt)]))
            .get();
    return [for (final row in rows) _repair(row)];
  }

  @override
  Future<List<RepairFormField>> listFormDefinitions({
    required String shopId,
  }) async {
    await _requireShop(shopId);
    final rows = await LocalCanonicalRecordRepository(
      database: database,
      merchantId: merchantId,
    ).list(entityType: 'SERVICE_FORM_DEFINITION');
    return [
      for (final row in rows)
        if (row.payload['is_active'] != false &&
            (row.payload['entity_type'] == 'REPAIR_TICKET' ||
                row.payload['entity_type'] == 'REPAIR_WORK_ITEM'))
          RepairFormField.fromJson(row.payload),
    ];
  }

  @override
  Future<List<RepairWorkItem>> listWorkItems({
    required String repairOrderId,
  }) async {
    final parent = await _requireRepair(repairOrderId);
    final rows = await _children(repairOrderId, 'WORK_ITEM');
    final workStatus = switch (parent.status) {
      'COMPLETED' => 'COMPLETED',
      'READY_FOR_PICKUP' => 'COMPLETED',
      'IN_PROGRESS' => 'IN_PROGRESS',
      'REFUNDED' => 'CANCELLED',
      _ => 'OPEN',
    };
    final output = <RepairWorkItem>[
      RepairWorkItem(
        id: parent.workItemId ?? parent.id,
        serviceOrderId: parent.id,
        sequenceNumber: 1,
        type: 'DEVICE',
        status: workStatus,
        deviceType: parent.deviceType ?? '',
        manufacturer: parent.manufacturer,
        model: parent.model,
        serialNumber: parent.serialNumber,
        issueDescription: parent.issueDescription ?? '',
        issues: _storedList(parent.customFields, '_issues'),
        conditions: _storedList(parent.customFields, '_conditions'),
        note: parent.note,
        fields: _publicFields(parent.customFields),
      ),
    ];
    output.addAll([
      for (var index = 0; index < rows.length; index++)
        RepairWorkItem(
          id: rows[index].id,
          serviceOrderId: parent.id,
          sequenceNumber: index + 2,
          type: 'DEVICE',
          status: rows[index].status,
          deviceType: rows[index].deviceType ?? '',
          manufacturer: rows[index].manufacturer,
          model: rows[index].model,
          serialNumber: rows[index].serialNumber,
          issueDescription: rows[index].issueDescription ?? '',
          issues: _storedList(rows[index].customFields, '_issues'),
          conditions: _storedList(rows[index].customFields, '_conditions'),
          note: rows[index].note,
          fields: _publicFields(rows[index].customFields),
        ),
    ]);
    return output;
  }

  @override
  Future<RepairWorkItem> updateWorkItem({
    required String repairOrderId,
    required String workItemId,
    required String status,
  }) async {
    final parent = await _requireRepair(repairOrderId);
    final normalizedStatus = status.trim().toUpperCase();
    final normalizedWorkItemId = workItemId.trim();
    if (!{
      'OPEN',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    }.contains(normalizedStatus)) {
      throw const FormatException('Work item status is invalid.');
    }
    final firstWorkItem = parent.workItemId == normalizedWorkItemId;
    final child = firstWorkItem
        ? null
        : await _singleOrNull(normalizedWorkItemId, 'WORK_ITEM');
    if (!firstWorkItem && (child == null || child.parentId != repairOrderId)) {
      throw StateError('Work item is outside the active repair.');
    }
    final beforeStatus = firstWorkItem
        ? _localChildStatus(parent.status)
        : child!.status;
    await database.transaction(() async {
      if (firstWorkItem) {
        final parentStatus = switch (normalizedStatus) {
          'OPEN' => 'RECEIVED',
          'IN_PROGRESS' => 'IN_PROGRESS',
          'COMPLETED' => 'READY_FOR_PICKUP',
          _ => 'IN_PROGRESS',
        };
        await (database.update(database.localRepairRecords)..where(
              (row) =>
                  row.id.equals(repairOrderId) &
                  row.merchantId.equals(merchantId) &
                  row.recordType.equals('REPAIR'),
            ))
            .write(LocalRepairRecordsCompanion(status: Value(parentStatus)));
      } else {
        await (database.update(database.localRepairRecords)..where(
              (row) =>
                  row.id.equals(child!.id) &
                  row.merchantId.equals(merchantId) &
                  row.recordType.equals('WORK_ITEM'),
            ))
            .write(
              LocalRepairRecordsCompanion(status: Value(normalizedStatus)),
            );
      }
      final refreshedParent = await _requireRepair(repairOrderId);
      final otherChildren = await _children(repairOrderId, 'WORK_ITEM');
      final childStatuses = <String>[
        if (firstWorkItem)
          normalizedStatus
        else
          _localChildStatus(refreshedParent.status),
        for (final item in otherChildren)
          item.id == child?.id ? normalizedStatus : item.status,
      ];
      final nextParentStatus =
          childStatuses.isNotEmpty &&
              childStatuses.every((item) => item == 'COMPLETED')
          ? 'READY_FOR_PICKUP'
          : childStatuses.any(
              (item) =>
                  item == 'IN_PROGRESS' ||
                  item == 'COMPLETED' ||
                  item == 'CANCELLED',
            )
          ? 'IN_PROGRESS'
          : 'RECEIVED';
      await (database.update(database.localRepairRecords)..where(
            (row) =>
                row.id.equals(repairOrderId) &
                row.merchantId.equals(merchantId) &
                row.recordType.equals('REPAIR'),
          ))
          .write(LocalRepairRecordsCompanion(status: Value(nextParentStatus)));
      await _audit.record(
        action: 'UPDATE',
        entityType: 'repair_work_item',
        entityId: normalizedWorkItemId,
        shopId: parent.shopId,
        beforeData: {'repair_order_id': repairOrderId, 'status': beforeStatus},
        afterData: {
          'repair_order_id': repairOrderId,
          'status': normalizedStatus,
        },
      );
    });
    return (await listWorkItems(
      repairOrderId: repairOrderId,
    )).firstWhere((item) => item.id == normalizedWorkItemId);
  }

  @override
  Future<List<RepairDiagnostic>> listDiagnostics({
    required String repairOrderId,
  }) async {
    await _requireRepair(repairOrderId);
    final rows = await _children(repairOrderId, 'DIAGNOSTIC');
    return [for (final row in rows) _diagnostic(row)];
  }

  @override
  Future<RepairDiagnostic> createDiagnostic({
    required String repairOrderId,
    required String diagnosis,
    String? estimatedCost,
    String? workItemId,
  }) async {
    await _requireRepair(repairOrderId);
    await _requireWorkItem(repairOrderId, workItemId);
    final id = _uuid.v4();
    final repair = await _requireRepair(repairOrderId);
    await database.transaction(() async {
      await database
          .into(database.localRepairRecords)
          .insert(
            _companion(
              id: id,
              recordType: 'DIAGNOSTIC',
              parentId: repairOrderId,
              workItemId: workItemId,
              diagnosis: _required(diagnosis, 'Diagnosis'),
              estimatedCost: _optional(estimatedCost),
              createdAt: _now(),
            ),
          );
      await _audit.record(
        action: 'CREATE',
        entityType: 'repair_diagnostic',
        entityId: id,
        shopId: repair.shopId,
        afterData: {
          'repair_order_id': repairOrderId,
          'diagnosis': _required(diagnosis, 'Diagnosis'),
          'estimated_cost': _optional(estimatedCost),
        },
      );
    });
    return _diagnostic(await _single(id));
  }

  @override
  Future<List<RepairPayment>> listPayments({
    required String repairOrderId,
  }) async {
    await _requireRepair(repairOrderId);
    final rows = await _children(repairOrderId, 'PAYMENT');
    return [for (final row in rows) _payment(row)];
  }

  @override
  Future<RepairPayment> createPayment({
    required String repairOrderId,
    required String kind,
    required String method,
    required String amount,
  }) async {
    final repair = await _requireRepair(repairOrderId);
    final parsedAmount = _money(amount);
    if (parsedAmount.isNegative || parsedAmount.minorUnits == BigInt.zero) {
      throw const FormatException('Payment amount must be greater than zero.');
    }
    final paid = await _paidAmount(repairOrderId);
    final total = _money(repair.totalCost);
    if ((paid + parsedAmount).minorUnits > total.minorUnits) {
      throw const FormatException('Payment exceeds the local repair balance.');
    }
    final id = _uuid.v4();
    await database.transaction(() async {
      await database
          .into(database.localRepairRecords)
          .insert(
            _companion(
              id: id,
              recordType: 'PAYMENT',
              parentId: repairOrderId,
              status: 'RECORDED',
              kind: _required(kind, 'Payment kind'),
              method: _required(method, 'Payment method'),
              amount: parsedAmount.toDecimalString(),
              createdAt: _now(),
            ),
          );
      final newPaid = paid + parsedAmount;
      await (database.update(database.localRepairRecords)..where(
            (row) =>
                row.id.equals(repairOrderId) &
                row.merchantId.equals(merchantId) &
                row.recordType.equals('REPAIR'),
          ))
          .write(
            LocalRepairRecordsCompanion(
              paymentStatus: Value(
                newPaid.minorUnits == BigInt.zero
                    ? 'UNPAID'
                    : newPaid.minorUnits >= total.minorUnits
                    ? 'PAID'
                    : 'PARTIAL',
              ),
            ),
          );
      await _audit.record(
        action: 'CREATE',
        entityType: 'repair_payment',
        entityId: id,
        shopId: repair.shopId,
        afterData: {
          'repair_order_id': repairOrderId,
          'kind': _required(kind, 'Payment kind'),
          'method': _required(method, 'Payment method'),
          'amount': parsedAmount.toDecimalString(),
        },
      );
    });
    return _payment(await _single(id));
  }

  @override
  Future<List<RepairRefund>> listRefunds({
    required String repairOrderId,
  }) async {
    await _requireRepair(repairOrderId);
    return [
      for (final row in await _children(repairOrderId, 'REFUND')) _refund(row),
    ];
  }

  @override
  Future<RepairRefund> createRefund({
    required String repairOrderId,
    required String paymentId,
    required String amount,
    String? reason,
    String? idempotencyKey,
  }) async {
    final repair = await _requireRepair(repairOrderId);
    final payment = await _singleOrNull(paymentId, 'PAYMENT');
    if (payment == null || payment.parentId != repairOrderId) {
      throw StateError('Repair payment is outside the active repair.');
    }
    final commandKey = idempotencyKey?.trim().isNotEmpty == true
        ? idempotencyKey!.trim()
        : _uuid.v4();
    for (final row in await _children(repairOrderId, 'REFUND')) {
      final metadata = _metadata(row);
      if (metadata['idempotency_key'] == commandKey) return _refund(row);
    }
    final parsedAmount = _money(amount);
    if (parsedAmount.minorUnits <= BigInt.zero) {
      throw const FormatException('Refund amount must be greater than zero.');
    }
    var refunded = _money('0.00');
    for (final row in await _children(repairOrderId, 'REFUND')) {
      final metadata = _metadata(row);
      if (metadata['payment_id'] == paymentId && row.status == 'SUCCEEDED') {
        refunded += _money(row.amount ?? '0.00');
      }
    }
    final remaining = _money(payment.amount ?? '0.00') - refunded;
    if (parsedAmount.minorUnits > remaining.minorUnits) {
      throw const FormatException(
        'Refund amount exceeds the remaining repair payment.',
      );
    }
    final id = _uuid.v4();
    await database.transaction(() async {
      await database
          .into(database.localRepairRecords)
          .insert(
            _companion(
              id: id,
              recordType: 'REFUND',
              parentId: repairOrderId,
              status: 'SUCCEEDED',
              amount: parsedAmount.toDecimalString(),
              note: jsonEncode({
                'payment_id': paymentId,
                'reason': _optional(reason),
                'idempotency_key': commandKey,
              }),
              createdAt: _now(),
            ),
          );
      final newRefunded = refunded + parsedAmount;
      await (database.update(database.localRepairRecords)..where(
            (row) =>
                row.id.equals(paymentId) &
                row.merchantId.equals(merchantId) &
                row.recordType.equals('PAYMENT'),
          ))
          .write(
            LocalRepairRecordsCompanion(
              status: Value(
                newRefunded.minorUnits >=
                        _money(payment.amount ?? '0.00').minorUnits
                    ? 'REFUNDED'
                    : 'PARTIALLY_REFUNDED',
              ),
            ),
          );
      await _recalculateTotal(repair);
      await (database.update(database.localRepairRecords)..where(
            (row) =>
                row.id.equals(repairOrderId) &
                row.merchantId.equals(merchantId) &
                row.recordType.equals('REPAIR'),
          ))
          .write(const LocalRepairRecordsCompanion(status: Value('REFUNDED')));
      await _audit.record(
        action: 'CREATE',
        entityType: 'repair_refund',
        entityId: id,
        shopId: repair.shopId,
        afterData: {
          'repair_order_id': repairOrderId,
          'payment_id': paymentId,
          'amount': parsedAmount.toDecimalString(),
          'reason': _optional(reason),
        },
        requestId: commandKey,
      );
    });
    return _refund(await _single(id));
  }

  @override
  Future<List<RepairImage>> listImages({required String repairOrderId}) async {
    await _requireRepair(repairOrderId);
    final rows = await _children(repairOrderId, 'IMAGE');
    return [for (final row in rows) _image(row)];
  }

  @override
  Future<RepairImage> createImage({
    required String repairOrderId,
    required String filename,
    required String contentType,
    required String dataBase64,
    String? workItemId,
  }) async {
    await _requireRepair(repairOrderId);
    await _requireWorkItem(repairOrderId, workItemId);
    final id = _uuid.v4();
    await database
        .into(database.localRepairRecords)
        .insert(
          _companion(
            id: id,
            recordType: 'IMAGE',
            parentId: repairOrderId,
            workItemId: workItemId,
            note: jsonEncode({
              'filename': _required(filename, 'Filename'),
              'content_type': _required(contentType, 'Content type'),
              'data_base64': _required(dataBase64, 'Image data'),
            }),
            createdAt: _now(),
          ),
        );
    return _image(await _single(id));
  }

  @override
  Future<void> deleteImage(String id) => _deleteChild(id, 'IMAGE');

  @override
  Future<List<RepairPart>> listParts({required String repairOrderId}) async {
    await _requireRepair(repairOrderId);
    final rows = await _children(repairOrderId, 'PART');
    return [for (final row in rows) _part(row)];
  }

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
    final repair = await _requireRepair(repairOrderId);
    await _requireWorkItem(repairOrderId, workItemId);
    if (_optional(variantId) == null &&
        _optional(customerSuppliedPartId) == null) {
      throw const FormatException(
        'A catalog variant or customer part is required.',
      );
    }
    final quantityValue = num.tryParse(quantity.trim());
    if (quantityValue == null || quantityValue <= 0) {
      throw const FormatException('Part quantity must be positive.');
    }
    final normalizedPrice = _money(unitPrice).toDecimalString();
    final normalizedStatus = _required(status, 'Part status');
    final id = _uuid.v4();
    final variant = await _variant(variantId);
    final gross = _multiply(_money(normalizedPrice), quantity);
    final promotion = _optional(promotionId);
    if (promotion != null && normalizedStatus != 'USED') {
      throw const FormatException(
        'A repair-part promotion requires a USED catalog part.',
      );
    }
    final discount = await _partPromotionDiscount(
      promotionId: promotion,
      variant: variant,
      gross: gross,
      repairGrossSubtotal: await _grossRepairSubtotal(repair),
    );
    final metadata = {
      'variant_id': _optional(variantId),
      'customer_supplied_part_id': _optional(customerSuppliedPartId),
      'quantity': quantity.trim(),
      'unit_price': normalizedPrice,
      'discount_amount': discount.toDecimalString(),
      'status': normalizedStatus,
      'promotion_id': promotion,
    };
    final locationId = await _stockLocation(repair.shopId);
    await database.transaction(() async {
      await database
          .into(database.localRepairRecords)
          .insert(
            _companion(
              id: id,
              recordType: 'PART',
              parentId: repairOrderId,
              workItemId: workItemId,
              note: jsonEncode(metadata),
              createdAt: _now(),
            ),
          );
      await _consumePartStock(
        repair: repair,
        partId: id,
        variant: variant,
        locationId: locationId,
        quantity: quantity,
        status: normalizedStatus,
      );
      await _redeemPromotionWithinTransaction(promotion);
      await _recalculateTotal(repair);
    });
    return _part(await _single(id));
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
  }) async {
    final row = await _singleOrNull(id, 'PART');
    if (row == null) {
      throw StateError('Repair part is outside the active merchant.');
    }
    final repair = await _requireRepair(row.parentId ?? '');
    final previous = _metadata(row);
    if (previous['status']?.toString() == 'USED') {
      throw const FormatException(
        'Used repair parts are immutable; record a stock return instead.',
      );
    }
    final quantityValue = num.tryParse(quantity.trim());
    if (quantityValue == null || quantityValue <= 0) {
      throw const FormatException('Part quantity must be positive.');
    }
    final normalizedStatus = _required(status, 'Part status');
    final variant = await _variant(variantId);
    final previousPromotion = _optional(previous['promotion_id']?.toString());
    final promotion = _optional(promotionId);
    if (promotion != null && normalizedStatus != 'USED') {
      throw const FormatException(
        'A repair-part promotion requires a USED catalog part.',
      );
    }
    if (previousPromotion != null && previousPromotion != promotion) {
      throw const FormatException(
        'A repair-part promotion cannot be changed after it is applied.',
      );
    }
    final normalizedPrice = _money(unitPrice).toDecimalString();
    final gross = _multiply(_money(normalizedPrice), quantity);
    final discount = await _partPromotionDiscount(
      promotionId: promotion,
      variant: variant,
      gross: gross,
      repairGrossSubtotal: await _grossRepairSubtotal(
        repair,
        excludingPartId: id,
      ),
    );
    final locationId = await _stockLocation(repair.shopId);
    await database.transaction(() async {
      await (database.update(database.localRepairRecords)..where(
            (item) => item.id.equals(id) & item.merchantId.equals(merchantId),
          ))
          .write(
            LocalRepairRecordsCompanion(
              note: Value(
                jsonEncode({
                  'variant_id': _optional(variantId),
                  'customer_supplied_part_id': _optional(
                    customerSuppliedPartId,
                  ),
                  'quantity': quantity.trim(),
                  'unit_price': normalizedPrice,
                  'discount_amount': discount.toDecimalString(),
                  'status': normalizedStatus,
                  'promotion_id': promotion,
                }),
              ),
            ),
          );
      await _consumePartStock(
        repair: repair,
        partId: id,
        variant: variant,
        locationId: locationId,
        quantity: quantity,
        status: normalizedStatus,
      );
      if (previousPromotion == null) {
        await _redeemPromotionWithinTransaction(promotion);
      }
      await _recalculateTotal(repair);
    });
    return _part(await _single(id));
  }

  @override
  Future<void> deletePart(String id) async {
    final row = await _singleOrNull(id, 'PART');
    if (row == null) {
      throw StateError('Repair part is outside the active merchant.');
    }
    final metadata = _metadata(row);
    if (metadata['status']?.toString() == 'USED') {
      throw const FormatException(
        'Used repair parts are immutable; record a stock return instead.',
      );
    }
    final repair = await _requireRepair(row.parentId ?? '');
    final promotion = _optional(_metadata(row)['promotion_id']?.toString());
    await database.transaction(() async {
      await (database.delete(database.localRepairRecords)..where(
            (item) => item.id.equals(id) & item.merchantId.equals(merchantId),
          ))
          .go();
      await _releasePromotionWithinTransaction(promotion);
      await _recalculateTotal(repair);
    });
  }

  @override
  Future<List<RepairApproval>> listApprovals({
    required String repairOrderId,
  }) async {
    await _requireRepair(repairOrderId);
    return [
      for (final row in await _children(repairOrderId, 'APPROVAL'))
        _approval(row),
    ];
  }

  @override
  Future<RepairApproval> createApproval({
    required String repairOrderId,
    required int approvalVersion,
    required String status,
    String? approvedAmount,
    DateTime? approvedAt,
    String? workItemId,
  }) async {
    await _requireRepair(repairOrderId);
    await _requireWorkItem(repairOrderId, workItemId);
    final id = _uuid.v4();
    await database
        .into(database.localRepairRecords)
        .insert(
          _companion(
            id: id,
            recordType: 'APPROVAL',
            parentId: repairOrderId,
            workItemId: workItemId,
            note: jsonEncode({
              'approval_version': approvalVersion,
              'status': _required(status, 'Approval status'),
              'approved_amount': _optional(approvedAmount),
              'approved_at': approvedAt?.toUtc().toIso8601String(),
            }),
            createdAt: _now(),
          ),
        );
    return _approval(await _single(id));
  }

  @override
  Future<RepairApproval> updateApproval({
    required String id,
    required String repairOrderId,
    required int approvalVersion,
    required String status,
    String? approvedAmount,
    DateTime? approvedAt,
  }) async {
    final row = await _singleOrNull(id, 'APPROVAL');
    if (row == null || row.parentId != repairOrderId) {
      throw StateError('Repair approval is outside the active merchant.');
    }
    await (database.update(database.localRepairRecords)..where(
          (item) => item.id.equals(id) & item.merchantId.equals(merchantId),
        ))
        .write(
          LocalRepairRecordsCompanion(
            note: Value(
              jsonEncode({
                'approval_version': approvalVersion,
                'status': _required(status, 'Approval status'),
                'approved_amount': _optional(approvedAmount),
                'approved_at': approvedAt?.toUtc().toIso8601String(),
              }),
            ),
          ),
        );
    return _approval(await _single(id));
  }

  @override
  Future<void> deleteApproval(String id) => _deleteChild(id, 'APPROVAL');

  @override
  Future<List<RepairWarranty>> listWarranties({
    required String repairOrderId,
  }) async {
    await _requireRepair(repairOrderId);
    return [
      for (final row in await _children(repairOrderId, 'WARRANTY'))
        _warranty(row),
    ];
  }

  @override
  Future<RepairWarranty> createWarranty({
    required String repairOrderId,
    required DateTime startsAt,
    required DateTime endsAt,
    String? terms,
    String? workItemId,
  }) async {
    await _requireRepair(repairOrderId);
    await _requireWorkItem(repairOrderId, workItemId);
    if (!endsAt.isAfter(startsAt)) {
      throw const FormatException('Warranty end must be after start.');
    }
    final id = _uuid.v4();
    await database
        .into(database.localRepairRecords)
        .insert(
          _companion(
            id: id,
            recordType: 'WARRANTY',
            parentId: repairOrderId,
            workItemId: workItemId,
            note: jsonEncode({
              'starts_at': startsAt.toUtc().toIso8601String(),
              'ends_at': endsAt.toUtc().toIso8601String(),
              'terms': _optional(terms),
            }),
            createdAt: _now(),
          ),
        );
    return _warranty(await _single(id));
  }

  @override
  Future<RepairWarranty> updateWarranty({
    required String id,
    required String repairOrderId,
    required DateTime startsAt,
    required DateTime endsAt,
    String? terms,
  }) async {
    final row = await _singleOrNull(id, 'WARRANTY');
    if (row == null || row.parentId != repairOrderId) {
      throw StateError('Repair warranty is outside the active merchant.');
    }
    if (!endsAt.isAfter(startsAt)) {
      throw const FormatException('Warranty end must be after start.');
    }
    await (database.update(database.localRepairRecords)..where(
          (item) => item.id.equals(id) & item.merchantId.equals(merchantId),
        ))
        .write(
          LocalRepairRecordsCompanion(
            note: Value(
              jsonEncode({
                'starts_at': startsAt.toUtc().toIso8601String(),
                'ends_at': endsAt.toUtc().toIso8601String(),
                'terms': _optional(terms),
              }),
            ),
          ),
        );
    return _warranty(await _single(id));
  }

  @override
  Future<void> deleteWarranty(String id) => _deleteChild(id, 'WARRANTY');

  @override
  Future<void> updateStatus({
    required RepairRecord repair,
    required String status,
  }) async {
    await _requireRepair(repair.id);
    final nextStatus = _required(status, 'Status');
    if (!_repairStatuses.contains(nextStatus)) {
      throw const FormatException(
        'Repair status must be Received, In progress, Ready for pickup, Complete and closed, or Refund.',
      );
    }
    if (nextStatus == 'REFUNDED') {
      throw const FormatException(
        'Record a repair payment refund to move the ticket to Refund status.',
      );
    }
    await database.transaction(() async {
      final updated =
          await (database.update(database.localRepairRecords)..where(
                (row) =>
                    row.id.equals(repair.id) &
                    row.merchantId.equals(merchantId) &
                    row.recordType.equals('REPAIR'),
              ))
              .write(LocalRepairRecordsCompanion(status: Value(nextStatus)));
      if (updated == 0) {
        throw StateError('Repair is outside the active merchant.');
      }
      await _audit.record(
        action: 'UPDATE',
        entityType: 'repair_order',
        entityId: repair.id,
        shopId: repair.shopId,
        beforeData: {'status': repair.status},
        afterData: {'status': nextStatus},
      );
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
    await _requireShop(shopId);
    final id = _uuid.v4();
    final normalizedWorkItems = workItems == null
        ? <RepairWorkItemInput>[]
        : [
            for (final item in workItems)
              item.id?.trim().isNotEmpty == true
                  ? item
                  : item.withId(_uuid.v4()),
          ];
    final firstWorkItemId = normalizedWorkItems.isNotEmpty
        ? normalizedWorkItems.first.id!
        : id;
    final fee = _money(
      additionalFee == null || additionalFee.trim().isEmpty
          ? '0'
          : additionalFee,
    );
    await database.transaction(() async {
      await database
          .into(database.localRepairRecords)
          .insert(
            _companion(
              id: id,
              recordType: 'REPAIR',
              shopId: shopId,
              orderNumber: _required(orderNumber, 'Order number'),
              deviceId: _uuid.v4(),
              deviceType: _required(deviceType, 'Device type'),
              manufacturer: _optional(manufacturer),
              model: _optional(model),
              serialNumber: _optional(serialNumber),
              issueDescription: _required(
                issueDescription,
                'Issue description',
              ),
              priority: _optional(priority) ?? 'NORMAL',
              customerName: _optional(customerName),
              customerPhone: _optional(customerPhone),
              status: 'RECEIVED',
              paymentStatus: 'UNPAID',
              totalCost: fee.toDecimalString(),
              additionalFee: fee.toDecimalString(),
              note: _optional(note),
              customFields: _jsonFields(
                _workItemFields(
                  normalizedWorkItems.isNotEmpty
                      ? normalizedWorkItems.first
                      : RepairWorkItemInput(
                          deviceType: deviceType,
                          issueDescription: issueDescription,
                        ),
                ),
              ),
              ticketFields: _jsonFields(ticketFields),
              workItemId: firstWorkItemId,
              createdAt: _now(),
            ),
          );
      for (final item in normalizedWorkItems.skip(1)) {
        final workItemId = item.id!;
        await database
            .into(database.localRepairRecords)
            .insert(
              _companion(
                id: workItemId,
                recordType: 'WORK_ITEM',
                parentId: id,
                workItemId: workItemId,
                shopId: shopId,
                deviceId: _uuid.v4(),
                deviceType: _required(item.deviceType, 'Device type'),
                manufacturer: _optional(item.manufacturer),
                model: _optional(item.model),
                serialNumber: _optional(item.serialNumber),
                issueDescription: _required(
                  item.issueDescription,
                  'Issue description',
                ),
                priority: _optional(priority) ?? 'NORMAL',
                customerName: _optional(customerName),
                customerPhone: _optional(customerPhone),
                status: 'OPEN',
                paymentStatus: 'UNPAID',
                totalCost: '0.00',
                note: _optional(item.note),
                customFields: _jsonFields(_workItemFields(item)),
                createdAt: _now(),
              ),
            );
      }
      await _audit.record(
        action: 'CREATE',
        entityType: 'repair_order',
        entityId: id,
        shopId: shopId,
        afterData: {
          'order_number': orderNumber.trim(),
          'device_type': _required(deviceType, 'Device type'),
          'issue_description': _required(issueDescription, 'Issue description'),
          'total_cost': fee.toDecimalString(),
        },
      );
    });
    return RepairTicketResult(
      repairOrderId: id,
      orderNumber: orderNumber.trim(),
    );
  }

  Future<List<LocalRepairRecord>> _children(String parentId, String type) =>
      (database.select(database.localRepairRecords)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.parentId.equals(parentId) &
                row.recordType.equals(type),
          ))
          .get();

  LocalAuditRepository get _audit => LocalAuditRepository(
    database: database,
    merchantId: merchantId,
    actorMembershipId: actorMembershipId,
  );

  Future<LocalRepairRecord> _requireRepair(String id) async {
    final row = await _singleOrNull(id, 'REPAIR');
    if (row == null) {
      throw StateError('Repair is outside the active merchant.');
    }
    return row;
  }

  Future<void> _requireWorkItem(
    String repairOrderId,
    String? workItemId,
  ) async {
    final normalized = workItemId?.trim();
    if (normalized == null || normalized.isEmpty) return;
    final parent = await _requireRepair(repairOrderId);
    if (parent.workItemId == normalized) return;
    final workItems = await _children(repairOrderId, 'WORK_ITEM');
    if (workItems.any((row) => (row.workItemId ?? row.id) == normalized)) {
      return;
    }
    throw StateError('Work item is outside the active repair.');
  }

  String _localChildStatus(String parentStatus) => switch (parentStatus) {
    'IN_PROGRESS' => 'IN_PROGRESS',
    'READY_FOR_PICKUP' || 'COMPLETED' => 'COMPLETED',
    'REFUNDED' => 'CANCELLED',
    _ => 'OPEN',
  };

  Future<void> _requireShop(String shopId) async {
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null) throw StateError('Shop is outside the active merchant.');
  }

  Future<LocalRepairRecord> _single(String id) =>
      (database.select(database.localRepairRecords)..where(
            (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
          ))
          .getSingle();

  Future<LocalRepairRecord?> _singleOrNull(String id, String type) =>
      (database.select(database.localRepairRecords)..where(
            (row) =>
                row.id.equals(id) &
                row.merchantId.equals(merchantId) &
                row.recordType.equals(type),
          ))
          .getSingleOrNull();

  Future<ExactMoney> _paidAmount(String repairId) async {
    final payments = await _children(repairId, 'PAYMENT');
    final refunds = await _children(repairId, 'REFUND');
    var total = ExactMoney(minorUnits: BigInt.zero, decimalPlaces: 2);
    for (final payment in payments) {
      total += _money(payment.amount ?? '0');
    }
    for (final refund in refunds) {
      if (refund.status == 'SUCCEEDED') total -= _money(refund.amount ?? '0');
    }
    return total;
  }

  Future<CachedCatalogVariant?> _variant(String? variantId) async {
    final id = _optional(variantId);
    if (id == null) return null;
    final variant =
        await (database.select(database.cachedCatalogVariants)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (variant == null) {
      throw const FormatException('The replacement variant is unavailable.');
    }
    return variant;
  }

  Future<ExactMoney> _partPromotionDiscount({
    required String? promotionId,
    required CachedCatalogVariant? variant,
    required ExactMoney gross,
    required ExactMoney repairGrossSubtotal,
  }) async {
    if (promotionId == null) return _money('0.00');
    if (variant == null) {
      throw const FormatException(
        'A promotion can only be applied to a catalog repair part.',
      );
    }
    final promotion =
        await (database.select(database.localPromotions)..where(
              (row) =>
                  row.id.equals(promotionId) &
                  row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (promotion == null) {
      throw const FormatException('The selected promotion is not available.');
    }
    final now = DateTime.now().toUtc();
    if (!promotion.isActive ||
        (promotion.startsAt != null && now.isBefore(promotion.startsAt!)) ||
        (promotion.endsAt != null && !now.isBefore(promotion.endsAt!)) ||
        (promotion.usageLimit != null &&
            promotion.redemptionCount >= promotion.usageLimit!)) {
      throw const FormatException('The selected promotion is not available.');
    }
    final scopes =
        await (database.select(database.localPromotionScopes)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.promotionId.equals(promotionId),
            ))
            .get();
    if (scopes.isNotEmpty &&
        !scopes.any(
          (scope) =>
              scope.productId == variant.productId &&
              (scope.variantId == null || scope.variantId == variant.id),
        )) {
      throw const FormatException(
        'The promotion does not apply to this repair part.',
      );
    }
    final minimum = _money(promotion.minimumSubtotal);
    if ((repairGrossSubtotal + gross).minorUnits < minimum.minorUnits) {
      throw const FormatException(
        'The repair total does not meet the promotion minimum.',
      );
    }
    final value = _money(promotion.value);
    final discount = promotion.promotionType == 'PERCENTAGE'
        ? _percentageOf(gross, value)
        : value.minorUnits > gross.minorUnits
        ? gross
        : value;
    return discount;
  }

  Future<ExactMoney> _grossRepairSubtotal(
    LocalRepairRecord repair, {
    String? excludingPartId,
  }) async {
    var total = _money(repair.additionalFee ?? '0.00');
    for (final part in await _children(repair.id, 'PART')) {
      if (part.id == excludingPartId) continue;
      final metadata = _metadata(part);
      total += _multiply(
        _money(metadata['unit_price']?.toString() ?? '0.00'),
        metadata['quantity']?.toString() ?? '0',
      );
    }
    return total;
  }

  Future<void> _redeemPromotionWithinTransaction(String? promotionId) async {
    if (promotionId == null) return;
    final promotion =
        await (database.select(database.localPromotions)..where(
              (row) =>
                  row.id.equals(promotionId) &
                  row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (promotion == null) {
      throw const FormatException('The selected promotion is not available.');
    }
    if (promotion.usageLimit != null &&
        promotion.redemptionCount >= promotion.usageLimit!) {
      throw const FormatException(
        'The selected promotion is no longer available.',
      );
    }
    await (database.update(database.localPromotions)..where(
          (row) =>
              row.id.equals(promotionId) & row.merchantId.equals(merchantId),
        ))
        .write(
          LocalPromotionsCompanion(
            redemptionCount: Value(promotion.redemptionCount + 1),
          ),
        );
  }

  Future<void> _releasePromotionWithinTransaction(String? promotionId) async {
    if (promotionId == null) return;
    final promotion =
        await (database.select(database.localPromotions)..where(
              (row) =>
                  row.id.equals(promotionId) &
                  row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (promotion == null || promotion.redemptionCount == 0) return;
    await (database.update(database.localPromotions)..where(
          (row) =>
              row.id.equals(promotionId) & row.merchantId.equals(merchantId),
        ))
        .write(
          LocalPromotionsCompanion(
            redemptionCount: Value(promotion.redemptionCount - 1),
          ),
        );
  }

  Future<String?> _stockLocation(String? shopId) async {
    final id = _optional(shopId);
    if (id == null) return null;
    final location =
        await (database.select(database.locations)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(id) &
                  row.isActive.equals(true),
            ))
            .getSingleOrNull();
    return location?.id;
  }

  Future<void> _consumePartStock({
    required LocalRepairRecord repair,
    required String partId,
    required CachedCatalogVariant? variant,
    required String? locationId,
    required String quantity,
    required String status,
  }) async {
    if (variant == null || !variant.isStockTracked || status != 'USED') return;
    if (locationId == null) {
      throw const FormatException(
        'A shop stock location is required for a used replacement part.',
      );
    }
    await LocalInventoryRepository(
      database: database,
      merchantId: merchantId,
      actorMembershipId: actorMembershipId,
    ).recordSaleWithinTransaction(
      shopId: repair.shopId,
      variantId: variant.id,
      sourceLocationId: locationId,
      quantity: quantity,
      orderLineId: partId,
      eventKey: 'repair-part:$partId',
    );
  }

  Future<void> _recalculateTotal(LocalRepairRecord repair) async {
    final parts = await _children(repair.id, 'PART');
    var total = _money(repair.additionalFee ?? '0.00');
    for (final part in parts) {
      final metadata = _metadata(part);
      final unitPrice = _money(metadata['unit_price']?.toString() ?? '0.00');
      final gross = _multiply(
        unitPrice,
        metadata['quantity']?.toString() ?? '0',
      );
      final discount = _money(
        metadata['discount_amount']?.toString() ?? '0.00',
      );
      if (discount.minorUnits > gross.minorUnits) {
        throw const FormatException('Repair-part discount exceeds its price.');
      }
      total += gross - discount;
    }
    final paid = await _paidAmount(repair.id);
    if (paid.minorUnits > total.minorUnits) {
      throw const FormatException(
        'The repair has recorded payments above the new total.',
      );
    }
    await (database.update(database.localRepairRecords)..where(
          (row) =>
              row.id.equals(repair.id) &
              row.merchantId.equals(merchantId) &
              row.recordType.equals('REPAIR'),
        ))
        .write(
          LocalRepairRecordsCompanion(
            totalCost: Value(total.toDecimalString()),
            paymentStatus: Value(
              paid.minorUnits == BigInt.zero
                  ? 'UNPAID'
                  : paid.minorUnits >= total.minorUnits
                  ? 'PAID'
                  : 'PARTIAL',
            ),
          ),
        );
  }

  ExactMoney _multiply(ExactMoney unitPrice, String quantity) {
    final parts = quantity.trim().split('.');
    if (parts.length > 2 || parts.first.isEmpty) {
      throw const FormatException('Part quantity is invalid.');
    }
    final whole = BigInt.tryParse(parts.first);
    final fraction = parts.length == 1 ? '' : parts[1];
    if (whole == null || whole.isNegative || fraction.length > 3) {
      throw const FormatException('Part quantity is invalid.');
    }
    final milli =
        whole * BigInt.from(1000) + BigInt.tryParse(fraction.padRight(3, '0'))!;
    final raw = unitPrice.minorUnits * milli;
    var cents = raw ~/ BigInt.from(1000);
    if (raw % BigInt.from(1000) >= BigInt.from(500)) cents += BigInt.one;
    return ExactMoney(minorUnits: cents, decimalPlaces: 2);
  }

  ExactMoney _percentageOf(ExactMoney amount, ExactMoney percentage) {
    final denominator = BigInt.from(100) * BigInt.from(100);
    final numerator = amount.minorUnits * percentage.minorUnits;
    var cents = numerator ~/ denominator;
    if ((numerator % denominator).abs() * BigInt.from(2) >= denominator) {
      cents += numerator.isNegative ? -BigInt.one : BigInt.one;
    }
    return ExactMoney(minorUnits: cents, decimalPlaces: 2);
  }

  RepairRecord _repair(LocalRepairRecord row) => RepairRecord(
    id: row.id,
    orderNumber: row.orderNumber ?? '',
    shopId: row.shopId,
    status: row.status,
    issueDescription: row.issueDescription ?? '',
    receivedAt: DateTime.parse(row.createdAt).toUtc(),
    paymentStatus: row.paymentStatus,
    totalCost: row.totalCost,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    deviceId: row.deviceId,
    laborFee: row.laborFee,
    additionalFee: row.additionalFee,
    taxAmount: row.taxAmount,
    fields: _decodeFields(row.ticketFields),
  );

  RepairDiagnostic _diagnostic(LocalRepairRecord row) => RepairDiagnostic(
    id: row.id,
    repairOrderId: row.parentId ?? '',
    diagnosis: row.diagnosis ?? '',
    createdAt: DateTime.parse(row.createdAt).toUtc(),
    estimatedCost: row.estimatedCost,
    workItemId: row.workItemId,
  );

  RepairPayment _payment(LocalRepairRecord row) => RepairPayment(
    id: row.id,
    repairOrderId: row.parentId ?? '',
    kind: row.kind ?? '',
    method: row.method ?? '',
    status: row.status,
    amount: row.amount ?? '0.00',
    createdAt: DateTime.parse(row.createdAt).toUtc(),
  );

  RepairRefund _refund(LocalRepairRecord row) {
    final metadata = _metadata(row);
    return RepairRefund(
      id: row.id,
      repairOrderId: row.parentId ?? '',
      paymentId: metadata['payment_id']?.toString() ?? '',
      status: row.status,
      amount: row.amount ?? '0.00',
      reason: metadata['reason']?.toString(),
      createdAt: DateTime.parse(row.createdAt).toUtc(),
    );
  }

  RepairImage _image(LocalRepairRecord row) {
    final data = _metadata(row);
    return RepairImage(
      id: row.id,
      repairOrderId: row.parentId ?? '',
      filename: data['filename']?.toString() ?? 'image',
      contentType:
          data['content_type']?.toString() ?? 'application/octet-stream',
      dataBase64: data['data_base64']?.toString(),
      createdAt: DateTime.parse(row.createdAt).toUtc(),
      workItemId: row.workItemId,
    );
  }

  RepairPart _part(LocalRepairRecord row) {
    final data = _metadata(row);
    return RepairPart(
      id: row.id,
      repairOrderId: row.parentId ?? '',
      variantId: data['variant_id']?.toString(),
      customerSuppliedPartId: data['customer_supplied_part_id']?.toString(),
      quantity: data['quantity']?.toString() ?? '0',
      unitPrice: data['unit_price']?.toString() ?? '0.00',
      status: data['status']?.toString() ?? row.status,
      repairTotal: data['repair_total']?.toString(),
      workItemId: row.workItemId,
    );
  }

  RepairApproval _approval(LocalRepairRecord row) {
    final data = _metadata(row);
    final approvedAt = data['approved_at'];
    return RepairApproval(
      id: row.id,
      repairOrderId: row.parentId ?? '',
      approvalVersion: (data['approval_version'] as num?)?.toInt() ?? 1,
      status: data['status']?.toString() ?? row.status,
      approvedAmount: data['approved_amount']?.toString(),
      approvedAt: approvedAt == null
          ? null
          : DateTime.parse(approvedAt.toString()).toUtc(),
      createdAt: DateTime.parse(row.createdAt).toUtc(),
      workItemId: row.workItemId,
    );
  }

  RepairWarranty _warranty(LocalRepairRecord row) {
    final data = _metadata(row);
    return RepairWarranty(
      id: row.id,
      repairOrderId: row.parentId ?? '',
      startsAt: DateTime.parse(data['starts_at'].toString()).toUtc(),
      endsAt: DateTime.parse(data['ends_at'].toString()).toUtc(),
      terms: data['terms']?.toString(),
      workItemId: row.workItemId,
    );
  }

  Map<String, Object?> _metadata(LocalRepairRecord row) {
    final value = row.note;
    if (value == null || value.isEmpty) return const {};
    final decoded = jsonDecode(value);
    return decoded is Map ? Map<String, Object?>.from(decoded) : const {};
  }

  Future<void> _deleteChild(String id, String type) async {
    final deleted =
        await (database.delete(database.localRepairRecords)..where(
              (row) =>
                  row.id.equals(id) &
                  row.merchantId.equals(merchantId) &
                  row.recordType.equals(type),
            ))
            .go();
    if (deleted == 0) {
      throw StateError('Repair record is outside the active merchant.');
    }
  }

  LocalRepairRecordsCompanion _companion({
    required String id,
    required String recordType,
    required String createdAt,
    String? shopId,
    String? parentId,
    String? workItemId,
    String? orderNumber,
    String? deviceId,
    String? deviceType,
    String? manufacturer,
    String? model,
    String? serialNumber,
    String? issueDescription,
    String? priority,
    String? customerName,
    String? customerPhone,
    String status = 'RECORDED',
    String paymentStatus = 'UNPAID',
    String totalCost = '0.00',
    String? laborFee,
    String? additionalFee,
    String? taxAmount,
    String? diagnosis,
    String? estimatedCost,
    String? kind,
    String? method,
    String? amount,
    String? note,
    String? customFields,
    String? ticketFields,
  }) => LocalRepairRecordsCompanion.insert(
    id: id,
    merchantId: merchantId,
    shopId: shopId ?? '',
    recordType: recordType,
    parentId: Value(parentId),
    workItemId: Value(workItemId),
    orderNumber: Value(orderNumber),
    deviceId: Value(deviceId),
    deviceType: Value(deviceType),
    manufacturer: Value(manufacturer),
    model: Value(model),
    serialNumber: Value(serialNumber),
    issueDescription: Value(issueDescription),
    priority: Value(priority),
    customerName: Value(customerName),
    customerPhone: Value(customerPhone),
    status: status,
    paymentStatus: paymentStatus,
    totalCost: totalCost,
    laborFee: Value(laborFee),
    additionalFee: Value(additionalFee),
    taxAmount: Value(taxAmount),
    diagnosis: Value(diagnosis),
    estimatedCost: Value(estimatedCost),
    kind: Value(kind),
    method: Value(method),
    amount: Value(amount),
    note: Value(note),
    customFields: Value(customFields),
    ticketFields: Value(ticketFields),
    createdAt: createdAt,
  );

  ExactMoney _money(String value) => ExactMoney.parse(value, decimalPlaces: 2);

  String _required(String value, String label) {
    if (value.trim().isEmpty) throw FormatException('$label is required.');
    return value.trim();
  }

  String? _optional(String? value) =>
      value == null || value.trim().isEmpty ? null : value.trim();

  String _now() => DateTime.now().toUtc().toIso8601String();

  String? _jsonFields(Map<String, Object?>? fields) =>
      fields == null || fields.isEmpty ? null : jsonEncode(fields);

  Map<String, Object?> _workItemFields(RepairWorkItemInput item) => {
    ...?item.fields,
    '_issues': [
      item.issueDescription,
      ...item.issues,
    ].map((value) => value.trim()).where((value) => value.isNotEmpty).toList(),
    '_conditions': item.conditions
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList(),
  };

  List<String> _storedList(String? value, String key) {
    final fields = _decodeFields(value);
    return [
      for (final item in fields[key] is List ? fields[key] as List : const [])
        if (item.toString().trim().isNotEmpty) item.toString().trim(),
    ];
  }

  Map<String, Object?> _publicFields(String? value) =>
      Map<String, Object?>.from(_decodeFields(value))
        ..remove('_issues')
        ..remove('_conditions');

  Map<String, Object?> _decodeFields(String? value) {
    if (value == null || value.trim().isEmpty) return const {};
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map) {
        return decoded.map((key, item) => MapEntry(key.toString(), item));
      }
    } on FormatException {
      // Preserve compatibility with rows written before dynamic fields.
    }
    return const {};
  }
}
