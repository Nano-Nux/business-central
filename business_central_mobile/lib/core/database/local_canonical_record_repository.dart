import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import 'app_database.dart';

class LocalCanonicalRecordValue {
  const LocalCanonicalRecordValue({
    required this.id,
    required this.merchantId,
    required this.entityType,
    required this.entityId,
    required this.shopId,
    required this.payload,
    required this.sourceVersion,
    required this.isDeleted,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String merchantId;
  final String entityType;
  final String entityId;
  final String? shopId;
  final Map<String, Object?> payload;
  final int? sourceVersion;
  final bool isDeleted;
  final String createdAt;
  final String updatedAt;
}

/// Merchant-scoped storage for backend-shaped records that are cached before
/// a feature is safe to expose locally. It is a cache boundary, not a second
/// domain model: all payloads retain their canonical entity type and ID.
class LocalCanonicalRecordRepository {
  LocalCanonicalRecordRepository({
    required this.database,
    required this.merchantId,
  });

  final AppDatabase database;
  final String merchantId;
  static const _uuid = Uuid();

  Future<LocalCanonicalRecordValue> put({
    required String entityType,
    required String entityId,
    String? shopId,
    required Map<String, Object?> payload,
    int? sourceVersion,
    bool isDeleted = false,
  }) async {
    final type = entityType.trim();
    final id = entityId.trim();
    if (type.isEmpty || id.isEmpty) {
      throw const FormatException('Canonical entity type and ID are required.');
    }
    if (sourceVersion != null && sourceVersion < 0) {
      throw const FormatException(
        'Canonical source version cannot be negative.',
      );
    }
    await _requireShopIfPresent(shopId);
    final existing =
        await (database.select(database.localCanonicalRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.entityType.equals(type) &
                  row.entityId.equals(id),
            ))
            .getSingleOrNull();
    final now = DateTime.now().toUtc().toIso8601String();
    final row = LocalCanonicalRecordsCompanion.insert(
      id: existing?.id ?? _uuid.v4(),
      merchantId: merchantId,
      entityType: type,
      entityId: id,
      shopId: Value(shopId?.trim().isEmpty == true ? null : shopId?.trim()),
      payloadJson: jsonEncode(payload),
      sourceVersion: Value(sourceVersion),
      isDeleted: Value(isDeleted),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );
    await database
        .into(database.localCanonicalRecords)
        .insertOnConflictUpdate(row);
    return _fromRow(
      await (database.select(database.localCanonicalRecords)..where(
            (current) => current.id.equals(existing?.id ?? row.id.value),
          ))
          .getSingle(),
    );
  }

  Future<LocalCanonicalRecordValue?> get({
    required String entityType,
    required String entityId,
  }) async {
    final row =
        await (database.select(database.localCanonicalRecords)..where(
              (current) =>
                  current.merchantId.equals(merchantId) &
                  current.entityType.equals(entityType) &
                  current.entityId.equals(entityId),
            ))
            .getSingleOrNull();
    return row == null ? null : _fromRow(row);
  }

  Future<List<LocalCanonicalRecordValue>> list({
    String? entityType,
    String? shopId,
    bool includeDeleted = false,
  }) async {
    await _requireShopIfPresent(shopId);
    final rows =
        await (database.select(database.localCanonicalRecords)
              ..where((row) {
                final predicates = [row.merchantId.equals(merchantId)];
                if (entityType != null && entityType.trim().isNotEmpty) {
                  predicates.add(row.entityType.equals(entityType.trim()));
                }
                if (shopId != null && shopId.trim().isNotEmpty) {
                  predicates.add(row.shopId.equals(shopId.trim()));
                }
                if (!includeDeleted) {
                  predicates.add(row.isDeleted.equals(false));
                }
                return predicates.reduce((left, right) => left & right);
              })
              ..orderBy([(row) => OrderingTerm(expression: row.updatedAt)]))
            .get();
    return rows.map(_fromRow).toList(growable: false);
  }

  LocalCanonicalRecordValue _fromRow(LocalCanonicalRecord row) =>
      LocalCanonicalRecordValue(
        id: row.id,
        merchantId: row.merchantId,
        entityType: row.entityType,
        entityId: row.entityId,
        shopId: row.shopId,
        payload: Map<String, Object?>.from(jsonDecode(row.payloadJson) as Map),
        sourceVersion: row.sourceVersion,
        isDeleted: row.isDeleted,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      );

  Future<void> _requireShopIfPresent(String? shopId) async {
    final normalized = shopId?.trim();
    if (normalized == null || normalized.isEmpty) return;
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(normalized) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null) throw StateError('Shop is outside the merchant scope.');
  }
}
