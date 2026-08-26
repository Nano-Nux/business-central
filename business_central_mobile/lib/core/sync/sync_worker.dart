import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../../features/auth/data/online_auth_api.dart';
import '../database/app_database.dart';
import '../network/network_boundary.dart';
import 'sync_api.dart';
import 'sync_models.dart';
import 'sync_queue.dart';

abstract interface class SyncWorker {
  Future<void> synchronize(SyncContext context);
}

class FullyOfflineSyncWorker implements SyncWorker {
  const FullyOfflineSyncWorker();

  @override
  Future<void> synchronize(SyncContext context) async {}
}

class OnlineSyncWorker implements SyncWorker {
  OnlineSyncWorker({
    required this.database,
    required this.api,
    required this.queue,
  });

  final AppDatabase database;
  final SyncApi api;
  final SyncQueueWriter queue;
  static const _uuid = Uuid();
  bool _running = false;

  @override
  Future<void> synchronize(SyncContext context) async {
    if (_running) return;
    _running = true;
    try {
      final deviceIdentifier = await queue.deviceIdentifier();
      final clientSessionKey = _uuid.v4();
      final handshake = await api.handshake(
        deviceIdentifier: deviceIdentifier,
        clientSessionKey: clientSessionKey,
        scope: 'merchant',
      );
      await _saveHandshake(
        context,
        deviceIdentifier,
        clientSessionKey,
        handshake,
      );
      await _push(context, handshake);
      await _pull(context, handshake);
    } on ApiException catch (error) {
      await _recordFailure(
        context.merchantId,
        error,
        retryable:
            error.statusCode >= 500 ||
            error.statusCode == 408 ||
            error.statusCode == 429,
      );
    } on NetworkDeniedException catch (error) {
      await _recordFailure(context.merchantId, error, retryable: true);
    } on DioException catch (error) {
      await _recordFailure(context.merchantId, error, retryable: true);
    } finally {
      _running = false;
    }
  }

  Future<void> _saveHandshake(
    SyncContext context,
    String deviceIdentifier,
    String clientSessionKey,
    SyncHandshake handshake,
  ) async {
    final now = DateTime.now().toUtc().toIso8601String();
    await database.transaction(() async {
      await database
          .into(database.syncDevices)
          .insertOnConflictUpdate(
            SyncDevicesCompanion.insert(
              id: handshake.deviceId,
              merchantId: context.merchantId,
              membershipId: Value(context.membershipId),
              deviceIdentifier: deviceIdentifier,
              isActive: const Value(true),
              lastSeenAt: Value(now),
            ),
          );
      await database
          .into(database.syncSessions)
          .insertOnConflictUpdate(
            SyncSessionsCompanion.insert(
              id: handshake.sessionId,
              merchantId: context.merchantId,
              deviceId: handshake.deviceId,
              clientSessionKey: clientSessionKey,
              status: 'OPEN',
              scopeKey: handshake.scope,
              lastServerSequence: Value(handshake.serverSequence),
              startedAt: now,
            ),
          );
    });
  }

  Future<void> _push(SyncContext context, SyncHandshake handshake) async {
    final now = DateTime.now().toUtc();
    final pending = (await database.pendingOperations(context.merchantId))
        .where(
          (operation) =>
              operation.nextRetryAt == null ||
              DateTime.tryParse(operation.nextRetryAt!)?.isBefore(now) == true,
        )
        .toList();
    final ready = <OperationQueueData>[];
    for (final operation in pending) {
      final dependency = operation.dependencyOperationId;
      if (dependency == null || dependency.isEmpty) {
        ready.add(operation);
        continue;
      }
      final dependencyRow = await (database.select(
        database.operationQueue,
      )..where((row) => row.operationId.equals(dependency))).getSingleOrNull();
      if (dependencyRow?.status == 'SYNCED') ready.add(operation);
    }
    if (ready.isEmpty) return;

    final results = await api.push(
      sessionId: handshake.sessionId,
      operations: [
        for (final operation in ready)
          {
            'operation_id': operation.operationId,
            'entity_type': operation.entityType,
            'entity_id': operation.entityId,
            if (operation.shopId != null) 'shop_id': operation.shopId,
            'operation_type': operation.operationType,
            if (operation.baseVersion != null)
              'base_version': operation.baseVersion,
            'client_created_at': operation.clientCreatedAt,
            'payload': jsonDecode(operation.payload),
          },
      ],
    );
    final byId = {for (final result in results) result.operationId: result};
    for (final operation in ready) {
      final result = byId[operation.operationId];
      if (result == null) continue;
      switch (result.status) {
        case 'APPLIED':
          await database.transaction(() async {
            await database.updateOperation(
              operation.operationId,
              status: 'SYNCED',
              retryCount: 0,
              nextRetryAt: null,
              lastError: null,
            );
            if (result.entityVersion != null && result.serverPayload != null) {
              await _saveEntityVersion(
                merchantId: context.merchantId,
                entityType: operation.entityType,
                entityId: operation.entityId,
                version: result.entityVersion!,
                payload: result.serverPayload!,
              );
              await _applyChange(
                context.merchantId,
                SyncChange(
                  serverSequence: 0,
                  entityType: operation.entityType,
                  entityId: operation.entityId,
                  entityVersion: result.entityVersion!,
                  operationType: operation.operationType,
                  payload: result.serverPayload!,
                ),
              );
            }
          });
        case 'CONFLICT':
          await database.updateOperation(
            operation.operationId,
            status: 'CONFLICT',
            nextRetryAt: null,
            lastError: result.message ?? 'The server reported a conflict.',
          );
        case 'REJECTED':
          await database.updateOperation(
            operation.operationId,
            status: 'REJECTED',
            nextRetryAt: null,
            lastError:
                '${result.code ?? 'REJECTED'}: ${result.message ?? 'The server rejected the operation.'}',
          );
      }
    }
  }

  Future<void> _pull(SyncContext context, SyncHandshake handshake) async {
    var checkpoint =
        int.tryParse(
          (await database.syncCheckpoint(
                context.merchantId,
                'merchant',
              ))?.checkpoint ??
              '0',
        ) ??
        0;
    var more = true;
    while (more) {
      final page = await api.pull(
        sessionId: handshake.sessionId,
        scope: 'merchant',
        afterSequence: checkpoint,
      );
      await database.transaction(() async {
        for (final change in page.changes) {
          await _applyChange(context.merchantId, change);
          await _saveEntityVersion(
            merchantId: context.merchantId,
            entityType: change.entityType,
            entityId: change.entityId,
            version: change.entityVersion,
            payload: change.payload,
          );
        }
        if (page.changes.isNotEmpty || !page.hasMore) {
          checkpoint = page.nextSequence;
          await database.saveSyncCheckpoint(
            merchantId: context.merchantId,
            scopeKey: 'merchant',
            checkpoint: checkpoint.toString(),
          );
        }
      });
      more = page.hasMore;
    }
  }

  Future<void> _saveEntityVersion({
    required String merchantId,
    required String entityType,
    required String entityId,
    required int version,
    required Map<String, Object?> payload,
  }) {
    return database.saveSyncEntityVersion(
      merchantId: merchantId,
      entityType: entityType,
      entityId: entityId,
      version: version,
      payload: payload,
    );
  }

  Future<void> _applyChange(String merchantId, SyncChange change) async {
    if (change.entityType == 'REPAIR_TICKET') {
      await _applyRepairTicketChange(merchantId, change);
      return;
    }
    if (const {
      'REPAIR_DIAGNOSTIC',
      'REPAIR_IMAGE',
      'REPAIR_PART',
      'REPAIR_APPROVAL',
      'REPAIR_WARRANTY',
      'REPAIR_PAYMENT',
    }.contains(change.entityType)) {
      await _applyRepairChildChange(merchantId, change);
      return;
    }
    if (change.entityType != 'SHOP_SETTINGS') return;
    final payload = change.payload;
    final shopId = change.entityId;
    await (database.update(database.shops)..where(
          (row) => row.merchantId.equals(merchantId) & row.id.equals(shopId),
        ))
        .write(
          ShopsCompanion(
            name: payload['name'] is String
                ? Value(payload['name']! as String)
                : const Value.absent(),
            code: payload['code'] is String
                ? Value(payload['code']! as String)
                : const Value.absent(),
            timezone: payload['timezone'] is String
                ? Value(payload['timezone']! as String)
                : const Value.absent(),
            footerNote: payload['footer_note'] is String
                ? Value(payload['footer_note']! as String)
                : const Value.absent(),
            isActive: payload['is_active'] is bool
                ? Value(payload['is_active']! as bool)
                : const Value.absent(),
          ),
        );
    await _writeSetting(
      merchantId,
      shopId,
      'tax.rate',
      payload['tax_rate']?.toString() ?? '',
    );
    await _writeSetting(
      merchantId,
      shopId,
      'tax.label',
      payload['tax_label']?.toString() ?? '',
    );
    await _writeSetting(
      merchantId,
      shopId,
      'receipt.note',
      payload['receipt_note']?.toString() ?? '',
    );
  }

  Future<void> _applyRepairTicketChange(
    String merchantId,
    SyncChange change,
  ) async {
    final payload = change.payload;
    final shopId = _syncText(payload['shop_id']);
    if (shopId == null || shopId.isEmpty) return;
    final workItems = [
      for (final value in (payload['work_items'] as List?) ?? const [])
        if (value is Map)
          value.map((key, item) => MapEntry(key.toString(), item)),
    ];
    final first = workItems.isNotEmpty
        ? workItems.first
        : <String, Object?>{
            'device': payload['device'],
            'device_id': payload['device_id'],
            'issue_description': payload['issue_description'],
            'fields': const <String, Object?>{},
          };
    final firstDevice = _syncMap(first['device']);
    final now = DateTime.now().toUtc().toIso8601String();
    final existing =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.id.equals(change.entityId) &
                  row.recordType.equals('REPAIR'),
            ))
            .getSingleOrNull();
    final parentData = LocalRepairRecordsCompanion(
      status: _syncValue(payload['status']),
      paymentStatus: _syncValue(payload['payment_status']),
      totalCost: _syncValue(payload['total_cost']),
      additionalFee: _syncValue(payload['additional_fee']),
      taxAmount: _syncValue(payload['tax_amount']),
      orderNumber: _syncValue(payload['order_number']),
      shopId: existing == null ? Value(shopId) : const Value.absent(),
      customerName: _syncValue(payload['customer_name']),
      customerPhone: _syncValue(payload['customer_phone']),
      priority: _syncValue(payload['priority']),
      note: _syncValue(payload['note']),
      workItemId: Value(_syncText(first['id']) ?? change.entityId),
      deviceId: _syncValue(first['device_id']),
      deviceType: _syncValue(firstDevice['device_type']),
      manufacturer: _syncValue(firstDevice['manufacturer']),
      model: _syncValue(firstDevice['model']),
      serialNumber: _syncValue(firstDevice['serial_number']),
      issueDescription: _syncValue(
        first['issue_description'] ?? payload['issue_description'],
      ),
      customFields: first.containsKey('fields')
          ? Value(jsonEncode(_syncMap(first['fields'])))
          : const Value.absent(),
      ticketFields: payload['fields'] is Map
          ? Value(jsonEncode(payload['fields']))
          : const Value.absent(),
      createdAt: existing == null
          ? Value(_syncText(payload['received_at']) ?? now)
          : const Value.absent(),
    );
    if (existing == null) {
      await database
          .into(database.localRepairRecords)
          .insert(
            LocalRepairRecordsCompanion.insert(
              id: change.entityId,
              merchantId: merchantId,
              shopId: shopId,
              recordType: 'REPAIR',
              status: _syncText(payload['status']) ?? 'RECEIVED',
              paymentStatus: _syncText(payload['payment_status']) ?? 'UNPAID',
              totalCost: _syncText(payload['total_cost']) ?? '0.00',
              orderNumber: _syncValue(payload['order_number']),
              customerName: _syncValue(payload['customer_name']),
              customerPhone: _syncValue(payload['customer_phone']),
              priority: _syncValue(payload['priority']),
              note: _syncValue(payload['note']),
              workItemId: Value(_syncText(first['id']) ?? change.entityId),
              deviceId: _syncValue(first['device_id']),
              deviceType: _syncValue(firstDevice['device_type']),
              manufacturer: _syncValue(firstDevice['manufacturer']),
              model: _syncValue(firstDevice['model']),
              serialNumber: _syncValue(firstDevice['serial_number']),
              issueDescription: _syncValue(
                first['issue_description'] ?? payload['issue_description'],
              ),
              additionalFee: _syncValue(payload['additional_fee']),
              taxAmount: _syncValue(payload['tax_amount']),
              customFields: first.containsKey('fields')
                  ? Value(jsonEncode(_syncMap(first['fields'])))
                  : const Value.absent(),
              ticketFields: payload['fields'] is Map
                  ? Value(jsonEncode(payload['fields']))
                  : const Value.absent(),
              createdAt: _syncText(payload['received_at']) ?? now,
            ),
          );
    } else {
      await (database.update(database.localRepairRecords)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.id.equals(change.entityId) &
                row.recordType.equals('REPAIR'),
          ))
          .write(parentData);
    }

    final children =
        await (database.select(database.localRepairRecords)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.parentId.equals(change.entityId) &
                    row.recordType.equals('WORK_ITEM'),
              )
              ..orderBy([(row) => OrderingTerm.asc(row.createdAt)]))
            .get();
    for (var index = 1; index < workItems.length; index++) {
      final item = workItems[index];
      final itemId = _syncText(item['id']);
      if (itemId == null || itemId.isEmpty) continue;
      final device = _syncMap(item['device']);
      final child = index - 1 < children.length ? children[index - 1] : null;
      final childData = LocalRepairRecordsCompanion(
        id: child == null || child.id == itemId
            ? const Value.absent()
            : Value(itemId),
        shopId: child == null ? Value(shopId) : const Value.absent(),
        workItemId: Value(itemId),
        deviceId: _syncValue(item['device_id']),
        deviceType: _syncValue(device['device_type']),
        manufacturer: _syncValue(device['manufacturer']),
        model: _syncValue(device['model']),
        serialNumber: _syncValue(device['serial_number']),
        issueDescription: _syncValue(item['issue_description']),
        note: _syncValue(item['note']),
        status: _syncValue(item['status']),
        customFields: item['fields'] is Map
            ? Value(jsonEncode(item['fields']))
            : const Value.absent(),
      );
      if (child == null) {
        await database
            .into(database.localRepairRecords)
            .insert(
              LocalRepairRecordsCompanion.insert(
                id: itemId,
                merchantId: merchantId,
                shopId: shopId,
                recordType: 'WORK_ITEM',
                parentId: Value(change.entityId),
                workItemId: Value(itemId),
                deviceId: _syncValue(item['device_id']),
                deviceType: _syncValue(device['device_type']),
                manufacturer: _syncValue(device['manufacturer']),
                model: _syncValue(device['model']),
                serialNumber: _syncValue(device['serial_number']),
                issueDescription: _syncValue(item['issue_description']),
                note: _syncValue(item['note']),
                status: _syncText(item['status']) ?? 'OPEN',
                paymentStatus: 'UNPAID',
                totalCost: '0.00',
                customFields: item['fields'] is Map
                    ? Value(jsonEncode(item['fields']))
                    : const Value.absent(),
                createdAt: now,
              ),
            );
      } else {
        await (database.update(database.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.id.equals(child.id) &
                  row.recordType.equals('WORK_ITEM'),
            ))
            .write(childData);
      }
    }
  }

  Future<void> _applyRepairChildChange(
    String merchantId,
    SyncChange change,
  ) async {
    final payload = change.payload;
    final parentId = _syncText(payload['repair_order_id']);
    if (parentId == null || parentId.isEmpty) return;
    final parent =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.id.equals(parentId) &
                  row.recordType.equals('REPAIR'),
            ))
            .getSingleOrNull();
    if (parent == null) return;
    final recordType = switch (change.entityType) {
      'REPAIR_DIAGNOSTIC' => 'DIAGNOSTIC',
      'REPAIR_IMAGE' => 'IMAGE',
      'REPAIR_PART' => 'PART',
      'REPAIR_APPROVAL' => 'APPROVAL',
      'REPAIR_WARRANTY' => 'WARRANTY',
      'REPAIR_PAYMENT' => 'PAYMENT',
      _ => null,
    };
    if (recordType == null) return;
    final existing =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.id.equals(change.entityId) &
                  row.recordType.equals(recordType),
            ))
            .getSingleOrNull();
    final workItemId = _syncText(payload['work_item_id']);
    final now = DateTime.now().toUtc().toIso8601String();
    final metadata = switch (recordType) {
      'IMAGE' => {
        'filename': _syncText(payload['filename']) ?? 'image',
        'content_type':
            _syncText(payload['content_type']) ?? 'application/octet-stream',
        'data_base64': _syncText(payload['data_base64']) ?? '',
      },
      'PART' => {
        'variant_id': payload['variant_id'],
        'customer_supplied_part_id': payload['customer_supplied_part_id'],
        'quantity': _syncText(payload['quantity']) ?? '0',
        'unit_price': _syncText(payload['unit_price']) ?? '0.00',
        'status': _syncText(payload['status']) ?? 'REQUESTED',
        'repair_total': _syncText(payload['repair_total']),
      },
      'APPROVAL' => {
        'approval_version': payload['approval_version'],
        'status': _syncText(payload['status']) ?? 'PENDING',
        'approved_amount': payload['approved_amount'],
        'approved_at': payload['approved_at'],
      },
      'WARRANTY' => {
        'starts_at': payload['starts_at'],
        'ends_at': payload['ends_at'],
        'terms': payload['terms'],
      },
      _ => const <String, Object?>{},
    };
    final companion = LocalRepairRecordsCompanion(
      id: existing == null ? Value(change.entityId) : const Value.absent(),
      shopId: existing == null ? Value(parent.shopId) : const Value.absent(),
      parentId: existing == null ? Value(parentId) : const Value.absent(),
      workItemId: workItemId == null ? const Value.absent() : Value(workItemId),
      status: Value(
        _syncText(payload['status']) ??
            (recordType == 'PAYMENT' ? 'CAPTURED' : 'RECORDED'),
      ),
      paymentStatus: recordType == 'PAYMENT'
          ? const Value('CAPTURED')
          : const Value.absent(),
      totalCost: recordType == 'PART' && payload['repair_total'] != null
          ? Value(_syncText(payload['repair_total']) ?? parent.totalCost)
          : const Value.absent(),
      diagnosis: recordType == 'DIAGNOSTIC'
          ? _syncValue(payload['diagnosis'])
          : const Value.absent(),
      estimatedCost: recordType == 'DIAGNOSTIC'
          ? _syncValue(payload['estimated_cost'])
          : const Value.absent(),
      kind: recordType == 'PAYMENT'
          ? _syncValue(payload['kind'])
          : const Value.absent(),
      method: recordType == 'PAYMENT'
          ? _syncValue(payload['method'])
          : const Value.absent(),
      amount: recordType == 'PAYMENT'
          ? _syncValue(payload['amount'])
          : const Value.absent(),
      note: metadata.isEmpty
          ? const Value.absent()
          : Value(jsonEncode(metadata)),
      createdAt: existing == null ? Value(now) : const Value.absent(),
    );
    if (existing == null) {
      await database
          .into(database.localRepairRecords)
          .insert(
            LocalRepairRecordsCompanion.insert(
              id: change.entityId,
              merchantId: merchantId,
              shopId: parent.shopId,
              recordType: recordType,
              parentId: Value(parentId),
              workItemId: Value(workItemId),
              status:
                  _syncText(payload['status']) ??
                  (recordType == 'PAYMENT' ? 'CAPTURED' : 'RECORDED'),
              paymentStatus: recordType == 'PAYMENT' ? 'CAPTURED' : 'UNPAID',
              totalCost: recordType == 'PART'
                  ? (_syncText(payload['repair_total']) ?? '0.00')
                  : '0.00',
              diagnosis: recordType == 'DIAGNOSTIC'
                  ? _syncValue(payload['diagnosis'])
                  : const Value.absent(),
              estimatedCost: recordType == 'DIAGNOSTIC'
                  ? _syncValue(payload['estimated_cost'])
                  : const Value.absent(),
              kind: recordType == 'PAYMENT'
                  ? _syncValue(payload['kind'])
                  : const Value.absent(),
              method: recordType == 'PAYMENT'
                  ? _syncValue(payload['method'])
                  : const Value.absent(),
              amount: recordType == 'PAYMENT'
                  ? _syncValue(payload['amount'])
                  : const Value.absent(),
              note: metadata.isEmpty
                  ? const Value.absent()
                  : Value(jsonEncode(metadata)),
              createdAt: now,
            ),
          );
    } else {
      await (database.update(database.localRepairRecords)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.id.equals(change.entityId) &
                row.recordType.equals(recordType),
          ))
          .write(companion);
    }
    if (recordType == 'PAYMENT') {
      await (database.update(database.localRepairRecords)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.id.equals(parentId) &
                row.recordType.equals('REPAIR'),
          ))
          .write(
            LocalRepairRecordsCompanion(
              status: payload['parent_status'] == null
                  ? const Value.absent()
                  : _syncValue(payload['parent_status']),
              paymentStatus: _syncValue(payload['payment_status']),
            ),
          );
    }
  }

  static String? _syncText(Object? value) => value?.toString();

  static Value<String> _syncValue(Object? value) =>
      Value(_syncText(value) ?? '');

  static Map<String, Object?> _syncMap(Object? value) => value is Map
      ? value.map((key, item) => MapEntry(key.toString(), item))
      : const {};

  Future<void> _writeSetting(
    String merchantId,
    String shopId,
    String key,
    String value,
  ) async {
    final existing =
        await (database.select(database.merchantSettings)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId) &
                  row.settingKey.equals(key),
            ))
            .getSingleOrNull();
    await database
        .into(database.merchantSettings)
        .insertOnConflictUpdate(
          MerchantSettingsCompanion.insert(
            id: existing?.id ?? _uuid.v4(),
            merchantId: merchantId,
            shopId: Value(shopId),
            settingKey: key,
            valueType: 'STRING',
            valueJson: jsonEncode(value),
            updatedAt: DateTime.now().toUtc().toIso8601String(),
          ),
        );
  }

  Future<void> _recordFailure(
    String merchantId,
    Object error, {
    required bool retryable,
  }) async {
    final pending = await database.pendingOperations(merchantId);
    final now = DateTime.now().toUtc();
    for (final operation in pending) {
      final retryCount = operation.retryCount + (retryable ? 1 : 0);
      final exponent = retryCount.clamp(0, 8).toInt();
      final delaySeconds = retryable
          ? (1 << exponent).clamp(1, 300).toInt()
          : 0;
      final next = retryable
          ? now.add(Duration(seconds: delaySeconds)).toIso8601String()
          : null;
      await database.updateOperation(
        operation.operationId,
        status: retryable ? 'PENDING' : 'FAILED',
        retryCount: retryCount,
        nextRetryAt: next,
        lastError: error.toString(),
      );
    }
  }
}
