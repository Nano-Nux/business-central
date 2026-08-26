import '../../features/auth/data/online_auth_api.dart';
import 'sync_models.dart';

class SyncApi {
  SyncApi(this.api);
  final OnlineAuthApi api;

  Future<SyncHandshake> handshake({
    required String deviceIdentifier,
    required String clientSessionKey,
    required String scope,
  }) async {
    final response = await api.postResource('/sync/handshake', {
      'device_identifier': deviceIdentifier,
      'client_session_key': clientSessionKey,
      'scope': scope,
    });
    return SyncHandshake.fromJson(response);
  }

  Future<List<SyncOperationResult>> push({
    required String sessionId,
    required List<Map<String, Object?>> operations,
  }) async {
    final response = await api.postResource('/sync/push', {
      'session_id': sessionId,
      'operations': operations,
    });
    final values = response['results'] as List<Object?>? ?? const [];
    return [
      for (final value in values)
        SyncOperationResult.fromJson(Map<String, Object?>.from(value! as Map)),
    ];
  }

  Future<({List<SyncChange> changes, int nextSequence, bool hasMore})> pull({
    required String sessionId,
    required String scope,
    required int afterSequence,
  }) async {
    final response = await api.postResource('/sync/pull', {
      'session_id': sessionId,
      'scope': scope,
      'after_sequence': afterSequence,
      'limit': 100,
    });
    final values = response['changes'] as List<Object?>? ?? const [];
    return (
      changes: [
        for (final value in values)
          SyncChange.fromJson(Map<String, Object?>.from(value! as Map)),
      ],
      nextSequence:
          (response['next_sequence'] as num?)?.toInt() ?? afterSequence,
      hasMore: response['has_more'] as bool? ?? false,
    );
  }
}
