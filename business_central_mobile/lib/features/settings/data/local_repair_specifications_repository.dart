import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';
import '../application/repair_specifications_repository.dart';
import '../domain/shop_settings_models.dart';

class LocalRepairSpecificationsRepository
    implements RepairSpecificationsRepository {
  LocalRepairSpecificationsRepository({
    required this.database,
    this.actorMembershipId,
  });

  final AppDatabase database;
  final String? actorMembershipId;
  static const _uuid = Uuid();

  static const _faultPresetsKey = 'repair.fault_presets';
  static const _defaultDurationKey = 'repair.default_duration';

  @override
  Future<RepairSpecifications> load({
    required String merchantId,
    required String shopId,
  }) async {
    await _ensureShop(merchantId, shopId);
    final rows =
        await (database.select(database.merchantSettings)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId) &
                  row.settingKey.isIn(const [
                    _faultPresetsKey,
                    _defaultDurationKey,
                  ]),
            ))
            .get();
    final values = {for (final row in rows) row.settingKey: row.valueJson};
    return RepairSpecifications(
      merchantId: merchantId,
      shopId: shopId,
      faultPresets: _decodePresets(values[_faultPresetsKey]),
      defaultDuration: _decodeString(values[_defaultDurationKey]),
    );
  }

  @override
  Future<RepairSpecifications> save({
    required String merchantId,
    required String shopId,
    required List<String> faultPresets,
    required String defaultDuration,
  }) async {
    await _ensureShop(merchantId, shopId);
    final normalizedPresets = _normalizePresets(faultPresets);
    final normalizedDuration = defaultDuration.trim();
    if (normalizedDuration.length > 100) {
      throw const FormatException('Default repair duration is too long.');
    }
    await database.transaction(() async {
      await _write(
        merchantId: merchantId,
        shopId: shopId,
        key: _faultPresetsKey,
        value: jsonEncode(normalizedPresets),
      );
      await _write(
        merchantId: merchantId,
        shopId: shopId,
        key: _defaultDurationKey,
        value: jsonEncode(normalizedDuration),
      );
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'UPDATE',
        entityType: 'repair_specifications',
        entityId: shopId,
        shopId: shopId,
        requestId: _uuid.v4(),
        afterData: {
          'fault_presets': normalizedPresets,
          'default_duration': normalizedDuration,
          'storage': 'local_merchant_shop_settings',
        },
      );
    });
    return load(merchantId: merchantId, shopId: shopId);
  }

  Future<void> _ensureShop(String merchantId, String shopId) async {
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.merchantId.equals(merchantId) & row.id.equals(shopId),
            ))
            .getSingleOrNull();
    if (shop == null) {
      throw StateError('Repair specifications are outside the active shop.');
    }
  }

  Future<void> _write({
    required String merchantId,
    required String shopId,
    required String key,
    required String value,
  }) async {
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
          MerchantSettingsCompanion(
            id: Value(existing?.id ?? _uuid.v4()),
            merchantId: Value(merchantId),
            shopId: Value(shopId),
            settingKey: Value(key),
            valueType: const Value('STRING'),
            valueJson: Value(value),
            updatedAt: Value(DateTime.now().toUtc().toIso8601String()),
          ),
        );
  }

  List<String> _decodePresets(String? value) {
    if (value == null || value.isEmpty) return const [];
    try {
      final decoded = jsonDecode(value);
      if (decoded is List) {
        return _normalizePresets([
          for (final item in decoded)
            if (item is String) item,
        ]);
      }
    } on FormatException {
      // Fall through to the legacy comma-separated representation.
    }
    return _normalizePresets([value]);
  }

  String _decodeString(String? value) {
    if (value == null || value.isEmpty) return '';
    try {
      final decoded = jsonDecode(value);
      return decoded?.toString() ?? '';
    } on FormatException {
      return value;
    }
  }

  List<String> _normalizePresets(Iterable<String> values) {
    final result = <String>[];
    final seen = <String>{};
    for (final value in values) {
      for (final piece in value.split(',')) {
        final normalized = piece.trim();
        if (normalized.isEmpty || normalized.length > 120) continue;
        final key = normalized.toLowerCase();
        if (seen.add(key)) result.add(normalized);
      }
    }
    return result;
  }
}
