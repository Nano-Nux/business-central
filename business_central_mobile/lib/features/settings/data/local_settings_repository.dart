import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';
import '../../../core/sync/sync_queue.dart';
import '../application/settings_repository.dart';
import '../domain/shop_settings_models.dart';

class LocalSettingsRepository implements SettingsRepository {
  LocalSettingsRepository({required this.database, this.actorMembershipId});

  final AppDatabase database;
  final String? actorMembershipId;
  static const _uuid = Uuid();

  @override
  Future<ShopSettings> load({
    required String merchantId,
    required String shopId,
  }) async {
    final shop = await _shop(merchantId, shopId);
    final settings = await _settings(merchantId, shopId);
    return ShopSettings(
      id: shop.id,
      merchantId: merchantId,
      name: shop.name,
      code: shop.code,
      timezone: shop.timezone,
      isActive: shop.isActive,
      includeTax: settings['tax.include'] == 'true',
      taxRate: settings['tax.rate'],
      taxLabel: settings['tax.label'],
      receiptNote: settings['receipt.note'],
      footerNote: shop.footerNote,
    );
  }

  @override
  Future<ShopSettings> update({
    required String merchantId,
    required String shopId,
    required String name,
    required String code,
    required String timezone,
    bool? includeTax,
    String? taxRate,
    String? taxLabel,
    String? receiptNote,
    String? footerNote,
  }) => _update(
    merchantId: merchantId,
    shopId: shopId,
    name: name,
    code: code,
    timezone: timezone,
    includeTax: includeTax,
    taxRate: taxRate,
    taxLabel: taxLabel,
    receiptNote: receiptNote,
    footerNote: footerNote,
  );

  Future<ShopSettings> updateAndQueue({
    required String merchantId,
    required String shopId,
    required String name,
    required String code,
    required String timezone,
    bool? includeTax,
    String? taxRate,
    String? taxLabel,
    String? receiptNote,
    String? footerNote,
    required SyncQueueWriter queue,
  }) => _update(
    merchantId: merchantId,
    shopId: shopId,
    name: name,
    code: code,
    timezone: timezone,
    includeTax: includeTax,
    taxRate: taxRate,
    taxLabel: taxLabel,
    receiptNote: receiptNote,
    footerNote: footerNote,
    queue: queue,
  );

  Future<ShopSettings> _update({
    required String merchantId,
    required String shopId,
    required String name,
    required String code,
    required String timezone,
    bool? includeTax,
    String? taxRate,
    String? taxLabel,
    String? receiptNote,
    String? footerNote,
    SyncQueueWriter? queue,
  }) async {
    await _shop(merchantId, shopId);
    final operationId = queue?.operationId();
    final deviceId = queue == null ? null : await queue.deviceIdentifier();
    await database.transaction(() async {
      await (database.update(database.shops)..where(
            (row) => row.id.equals(shopId) & row.merchantId.equals(merchantId),
          ))
          .write(
            ShopsCompanion(
              name: Value(_required(name, 'Shop name')),
              code: Value(_required(code, 'Shop code')),
              timezone: Value(_required(timezone, 'Timezone')),
              footerNote: Value(footerNote?.trim() ?? ''),
            ),
          );
      await _writeSetting(
        merchantId,
        shopId,
        'tax.include',
        includeTax == true ? 'true' : 'false',
      );
      await _writeSetting(
        merchantId,
        shopId,
        'tax.rate',
        taxRate?.trim() ?? '',
      );
      await _writeSetting(
        merchantId,
        shopId,
        'tax.label',
        taxLabel?.trim() ?? '',
      );
      await _writeSetting(
        merchantId,
        shopId,
        'receipt.note',
        receiptNote?.trim() ?? '',
      );
      if (queue != null && operationId != null && deviceId != null) {
        final version = await database.syncEntityVersion(
          merchantId: merchantId,
          entityType: 'SHOP_SETTINGS',
          entityId: shopId,
        );
        await queue.enqueue(
          operationId: operationId,
          merchantId: merchantId,
          shopId: shopId,
          deviceId: deviceId,
          entityType: 'SHOP_SETTINGS',
          entityId: shopId,
          operationType: 'UPDATE',
          baseVersion: version?.version,
          payload: {
            'name': name.trim(),
            'code': code.trim(),
            'timezone': timezone.trim(),
            'include_tax': includeTax == true,
            'tax_rate': taxRate?.trim() ?? '',
            'tax_label': taxLabel?.trim() ?? '',
            'receipt_note': receiptNote?.trim() ?? '',
            'footer_note': footerNote?.trim() ?? '',
          },
        );
      }
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'UPDATE',
        entityType: 'shop_settings',
        entityId: shopId,
        shopId: shopId,
        requestId: operationId,
        afterData: {
          'name': name.trim(),
          'code': code.trim(),
          'timezone': timezone.trim(),
          'include_tax': includeTax == true,
          'tax_rate': taxRate?.trim() ?? '',
          'tax_label': taxLabel?.trim() ?? '',
          'receipt_note': receiptNote?.trim() ?? '',
          'footer_note': footerNote?.trim() ?? '',
        },
      );
    });
    return load(merchantId: merchantId, shopId: shopId);
  }

  Future<void> cacheFromServer(ShopSettings settings) async {
    await _shop(settings.merchantId, settings.id);
    await database.transaction(() async {
      await (database.update(database.shops)..where(
            (row) =>
                row.id.equals(settings.id) &
                row.merchantId.equals(settings.merchantId),
          ))
          .write(
            ShopsCompanion(
              name: Value(settings.name),
              code: Value(settings.code),
              timezone: Value(settings.timezone),
              isActive: Value(settings.isActive),
              footerNote: Value(settings.footerNote ?? ''),
            ),
          );
      await _writeSetting(
        settings.merchantId,
        settings.id,
        'tax.include',
        settings.includeTax ? 'true' : 'false',
      );
      await _writeSetting(
        settings.merchantId,
        settings.id,
        'tax.rate',
        settings.taxRate ?? '',
      );
      await _writeSetting(
        settings.merchantId,
        settings.id,
        'tax.label',
        settings.taxLabel ?? '',
      );
      await _writeSetting(
        settings.merchantId,
        settings.id,
        'receipt.note',
        settings.receiptNote ?? '',
      );
    });
  }

  Future<Shop> _shop(String merchantId, String shopId) async {
    final row =
        await (database.select(database.shops)..where(
              (entry) =>
                  entry.id.equals(shopId) & entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (row == null) throw StateError('Shop is outside the active merchant.');
    return row;
  }

  Future<Map<String, String>> _settings(
    String merchantId,
    String shopId,
  ) async {
    final rows =
        await (database.select(database.merchantSettings)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  (row.shopId.equals(shopId) | row.shopId.isNull()),
            ))
            .get();
    return {for (final row in rows) row.settingKey: _decode(row.valueJson)};
  }

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
    final now = DateTime.now().toUtc().toIso8601String();
    final companion = MerchantSettingsCompanion(
      id: Value(existing?.id ?? _uuid.v4()),
      merchantId: Value(merchantId),
      shopId: Value(shopId),
      settingKey: Value(key),
      valueType: const Value('STRING'),
      valueJson: Value(jsonEncode(value)),
      updatedAt: Value(now),
    );
    await database
        .into(database.merchantSettings)
        .insertOnConflictUpdate(companion);
  }

  String _decode(String value) {
    try {
      final decoded = jsonDecode(value);
      return decoded?.toString() ?? '';
    } on Object {
      return value;
    }
  }

  String _required(String value, String label) {
    if (value.trim().isEmpty) throw FormatException('$label is required.');
    return value.trim();
  }
}
