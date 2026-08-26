import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import 'app_database.dart';

class LocalAuditRecord {
  const LocalAuditRecord({
    required this.id,
    required this.merchantId,
    required this.shopId,
    required this.actorMembershipId,
    required this.action,
    required this.entityType,
    required this.entityId,
    required this.beforeData,
    required this.afterData,
    required this.requestId,
    required this.occurredAt,
  });

  final String id;
  final String merchantId;
  final String? shopId;
  final String? actorMembershipId;
  final String action;
  final String entityType;
  final String? entityId;
  final Map<String, Object?>? beforeData;
  final Map<String, Object?>? afterData;
  final String? requestId;
  final DateTime occurredAt;
}

/// Local append-only audit boundary for FULLY_OFFLINE domain services.
///
/// Do not add update or delete methods here. The caller may invoke [record]
/// inside an existing Drift transaction to make the business mutation and its
/// audit event commit or roll back together.
class LocalAuditRepository {
  LocalAuditRepository({
    required this.database,
    required this.merchantId,
    this.actorMembershipId,
  });

  final AppDatabase database;
  final String merchantId;
  final String? actorMembershipId;
  static const _uuid = Uuid();

  Future<void> record({
    required String action,
    required String entityType,
    String? entityId,
    String? shopId,
    Map<String, Object?>? beforeData,
    Map<String, Object?>? afterData,
    String? requestId,
    DateTime? occurredAt,
  }) async {
    final normalizedAction = action.trim().toUpperCase();
    final normalizedEntityType = entityType.trim();
    if (normalizedAction.isEmpty || normalizedEntityType.isEmpty) {
      throw const FormatException('Audit action and entity type are required.');
    }
    await _validateScope(shopId: shopId, actorMembershipId: actorMembershipId);
    final timestamp = (occurredAt ?? DateTime.now().toUtc()).toUtc();
    await database
        .into(database.localAuditEvents)
        .insert(
          LocalAuditEventsCompanion.insert(
            id: _uuid.v4(),
            merchantId: merchantId,
            shopId: Value(_optional(shopId)),
            actorMembershipId: Value(_optional(actorMembershipId)),
            action: normalizedAction,
            entityType: normalizedEntityType,
            entityId: Value(_optional(entityId)),
            beforeData: Value(_json(beforeData)),
            afterData: Value(_json(afterData)),
            requestId: Value(_optional(requestId)),
            occurredAt: timestamp.toIso8601String(),
          ),
        );
  }

  Future<List<LocalAuditRecord>> list({String? shopId}) async {
    final rows =
        await (database.select(database.localAuditEvents)
              ..where((row) => row.merchantId.equals(merchantId))
              ..where(
                (row) => shopId == null
                    ? const Constant(true)
                    : row.shopId.equals(shopId),
              )
              ..orderBy([
                (row) => OrderingTerm.desc(row.occurredAt),
                (row) => OrderingTerm.desc(row.id),
              ]))
            .get();
    return [for (final row in rows) _event(row)];
  }

  Future<void> _validateScope({
    required String? shopId,
    required String? actorMembershipId,
  }) async {
    if (shopId != null) {
      final shop =
          await (database.select(database.shops)..where(
                (row) =>
                    row.id.equals(shopId) & row.merchantId.equals(merchantId),
              ))
              .getSingleOrNull();
      if (shop == null) throw StateError('Audit shop is outside the merchant.');
    }
    if (actorMembershipId != null) {
      final membership =
          await (database.select(database.userMemberships)..where(
                (row) =>
                    row.id.equals(actorMembershipId) &
                    row.merchantId.equals(merchantId),
              ))
              .getSingleOrNull();
      if (membership == null) {
        throw StateError('Audit actor is outside the merchant.');
      }
    }
  }

  LocalAuditRecord _event(LocalAuditEvent row) => LocalAuditRecord(
    id: row.id,
    merchantId: row.merchantId,
    shopId: row.shopId,
    actorMembershipId: row.actorMembershipId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeData: _decode(row.beforeData),
    afterData: _decode(row.afterData),
    requestId: row.requestId,
    occurredAt: DateTime.parse(row.occurredAt).toUtc(),
  );

  String? _json(Map<String, Object?>? value) =>
      value == null ? null : jsonEncode(value);

  Map<String, Object?>? _decode(String? value) {
    if (value == null || value.isEmpty) return null;
    final decoded = jsonDecode(value);
    return decoded is Map
        ? Map<String, Object?>.from(decoded)
        : <String, Object?>{'value': decoded};
  }

  String? _optional(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }
}
