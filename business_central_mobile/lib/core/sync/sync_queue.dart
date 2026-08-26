import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:uuid/uuid.dart';

import '../database/app_database.dart';

class SyncQueueWriter {
  SyncQueueWriter({required this.database});

  final AppDatabase database;
  static const _uuid = Uuid();

  Future<String> deviceIdentifier() async {
    final existing = await (database.select(
      database.appMetadata,
    )..where((row) => row.key.equals('device_identifier'))).getSingleOrNull();
    if (existing != null && existing.value.trim().isNotEmpty) {
      return existing.value;
    }
    final identifier = _uuid.v4();
    await database
        .into(database.appMetadata)
        .insertOnConflictUpdate(
          AppMetadataCompanion.insert(
            key: 'device_identifier',
            value: identifier,
            updatedAt: DateTime.now().toUtc().toIso8601String(),
          ),
        );
    return identifier;
  }

  Future<void> enqueue({
    required String operationId,
    required String merchantId,
    String? shopId,
    required String deviceId,
    required String entityType,
    required String entityId,
    required String operationType,
    required Map<String, Object?> payload,
    int? baseVersion,
    String? dependencyOperationId,
  }) {
    final serialized = jsonEncode(payload);
    final payloadHash = sha256.convert(utf8.encode(serialized)).toString();
    return database.enqueueOperation(
      operationId: operationId,
      merchantId: merchantId,
      shopId: shopId,
      deviceId: deviceId,
      entityType: entityType,
      entityId: entityId,
      operationType: operationType,
      payload: payload,
      payloadHash: payloadHash,
      baseVersion: baseVersion,
      dependencyOperationId: dependencyOperationId,
    );
  }

  String operationId() => _uuid.v4();
}
