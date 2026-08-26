class SyncContext {
  const SyncContext({
    required this.merchantId,
    required this.membershipId,
    this.shopId,
  });

  final String merchantId;
  final String membershipId;
  final String? shopId;
}

class SyncHandshake {
  const SyncHandshake({
    required this.protocolVersion,
    required this.schemaVersion,
    required this.deviceId,
    required this.sessionId,
    required this.clientSessionKey,
    required this.scope,
    required this.serverSequence,
  });

  final String protocolVersion;
  final String schemaVersion;
  final String deviceId;
  final String sessionId;
  final String clientSessionKey;
  final String scope;
  final int serverSequence;

  factory SyncHandshake.fromJson(Map<String, Object?> json) {
    final device = json['device']! as Map;
    final session = json['session']! as Map;
    return SyncHandshake(
      protocolVersion: json['protocol_version'] as String,
      schemaVersion: json['schema_version'] as String,
      deviceId: device['id'] as String,
      sessionId: session['id'] as String,
      clientSessionKey: session['client_session_key'] as String,
      scope: session['scope'] as String? ?? 'merchant',
      serverSequence: (json['server_sequence'] as num?)?.toInt() ?? 0,
    );
  }
}

class SyncOperationResult {
  const SyncOperationResult({
    required this.operationId,
    required this.status,
    this.code,
    this.message,
    this.entityVersion,
    this.serverPayload,
  });

  final String operationId;
  final String status;
  final String? code;
  final String? message;
  final int? entityVersion;
  final Map<String, Object?>? serverPayload;

  factory SyncOperationResult.fromJson(Map<String, Object?> json) =>
      SyncOperationResult(
        operationId: json['operation_id'] as String,
        status: json['status'] as String,
        code: json['code'] as String?,
        message: json['message'] as String?,
        entityVersion: (json['entity_version'] as num?)?.toInt(),
        serverPayload: json['server_payload'] is Map
            ? Map<String, Object?>.from(json['server_payload']! as Map)
            : null,
      );
}

class SyncChange {
  const SyncChange({
    required this.serverSequence,
    required this.entityType,
    required this.entityId,
    required this.entityVersion,
    required this.operationType,
    required this.payload,
  });

  final int serverSequence;
  final String entityType;
  final String entityId;
  final int entityVersion;
  final String operationType;
  final Map<String, Object?> payload;

  factory SyncChange.fromJson(Map<String, Object?> json) => SyncChange(
    serverSequence: (json['server_sequence'] as num).toInt(),
    entityType: json['entity_type'] as String,
    entityId: json['entity_id'] as String,
    entityVersion: (json['entity_version'] as num).toInt(),
    operationType: json['operation_type'] as String,
    payload: Map<String, Object?>.from(json['payload']! as Map),
  );
}
