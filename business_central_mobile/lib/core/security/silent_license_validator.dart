import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';

import '../database/app_database.dart';
import '../network/network_boundary.dart';

typedef LockdownCallback = void Function(String reason);

class SilentLicenseValidator {
  SilentLicenseValidator({
    required this.networkClient,
    required this.database,
    this.onLockdown,
  });

  final NetworkClient networkClient;
  final AppDatabase database;
  final LockdownCallback? onLockdown;
  Timer? _heartbeatTimer;

  static const keyLocked = 'bc.license_locked';
  static const keyReason = 'bc.license_lock_reason';

  Future<bool> isLocked() async {
    final row = await (database.select(
      database.appMetadata,
    )..where((t) => t.key.equals(keyLocked))).getSingleOrNull();
    return row?.value == 'true';
  }

  Future<String> getLockReason() async {
    final row = await (database.select(
      database.appMetadata,
    )..where((t) => t.key.equals(keyReason))).getSingleOrNull();
    return row?.value ??
        'Your merchant account has been suspended by platform administration.';
  }

  Future<void> lock(String reason) async {
    final now = DateTime.now().toUtc().toIso8601String();
    await database
        .into(database.appMetadata)
        .insertOnConflictUpdate(
          AppMetadataCompanion.insert(
            key: keyLocked,
            value: 'true',
            updatedAt: now,
          ),
        );
    await database
        .into(database.appMetadata)
        .insertOnConflictUpdate(
          AppMetadataCompanion.insert(
            key: keyReason,
            value: reason,
            updatedAt: now,
          ),
        );
    onLockdown?.call(reason);
  }

  Future<void> unlock() async {
    final now = DateTime.now().toUtc().toIso8601String();
    await database
        .into(database.appMetadata)
        .insertOnConflictUpdate(
          AppMetadataCompanion.insert(
            key: keyLocked,
            value: 'false',
            updatedAt: now,
          ),
        );
    await (database.delete(
      database.appMetadata,
    )..where((t) => t.key.equals(keyReason))).go();
  }

  Future<void> checkLicense({String? overrideToken}) async {
    try {
      String? token = overrideToken;
      if (token == null || token.isEmpty) {
        final row =
            await (database.select(database.appMetadata)..where(
                  (t) =>
                      t.key.equals('bc.access_token') |
                      t.key.equals('access_token'),
                ))
                .getSingleOrNull();
        token = row?.value;
      }

      if (token == null || token.isEmpty) {
        // No token yet, skip heartbeat until login
        return;
      }

      final response = await networkClient.request(
        method: 'GET',
        path: '/merchants/me/status',
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
      );

      if (response.statusCode == 401 || response.statusCode == 403) {
        await lock('Merchant account has been suspended or deactivated.');
        return;
      }

      if (response.statusCode == 200 && response.data != null) {
        Map<String, dynamic> data;
        if (response.data is Map) {
          data = Map<String, dynamic>.from(response.data as Map);
        } else {
          data = jsonDecode(response.data.toString()) as Map<String, dynamic>;
        }

        final isActive = data['is_active'] as bool? ?? true;
        final status = data['status']?.toString().toUpperCase();

        if (!isActive || status == 'SUSPENDED') {
          await lock(
            'Merchant account has been suspended by platform administration.',
          );
        } else {
          // Successfully confirmed active
          final currentlyLocked = await isLocked();
          if (currentlyLocked) {
            await unlock();
          }
        }
      }
    } catch (_) {
      // Offline network failure - gracefully allow offline execution
    }
  }

  void startPeriodicHeartbeat({
    Duration interval = const Duration(minutes: 5),
  }) {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(
      interval,
      (_) => unawaited(checkLicense()),
    );
  }

  void stopPeriodicHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }
}
