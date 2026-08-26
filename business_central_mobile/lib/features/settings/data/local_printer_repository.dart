import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';

enum LocalPrinterConnectionType { bluetooth, network, usb }

class LocalPrinterProfileRecord {
  const LocalPrinterProfileRecord({
    required this.id,
    required this.merchantId,
    required this.shopId,
    required this.name,
    required this.connectionType,
    required this.deviceAddress,
    required this.networkHost,
    required this.networkPort,
    required this.paperWidthMm,
    required this.fontScalePercent,
    required this.isDefault,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String merchantId;
  final String shopId;
  final String name;
  final LocalPrinterConnectionType connectionType;
  final String? deviceAddress;
  final String? networkHost;
  final int networkPort;
  final int paperWidthMm;
  final int fontScalePercent;
  final bool isDefault;
  final String createdAt;
  final String updatedAt;

  Map<String, Object?> toMap() => {
    'id': id,
    'merchant_id': merchantId,
    'shop_id': shopId,
    'name': name,
    'connection_type': connectionType.name,
    'device_address': deviceAddress,
    'network_host': networkHost,
    'network_port': networkPort,
    'paper_width_mm': paperWidthMm,
    'font_scale_percent': fontScalePercent,
    'is_default': isDefault,
    'created_at': createdAt,
    'updated_at': updatedAt,
  };
}

class LocalPrinterRepository {
  LocalPrinterRepository({
    required this.database,
    required this.merchantId,
    this.actorMembershipId,
  });

  final AppDatabase database;
  final String merchantId;
  final String? actorMembershipId;
  static const _uuid = Uuid();

  Future<List<LocalPrinterProfileRecord>> list({required String shopId}) async {
    await _requireShop(shopId);
    final rows =
        await (database.select(database.localPrinterProfiles)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.shopId.equals(shopId),
              )
              ..orderBy([
                (row) => OrderingTerm(
                  expression: row.isDefault,
                  mode: OrderingMode.desc,
                ),
                (row) => OrderingTerm(expression: row.name),
              ]))
            .get();
    return rows.map(_fromRow).toList(growable: false);
  }

  Future<LocalPrinterProfileRecord?> defaultFor({
    required String shopId,
  }) async {
    final profiles = await list(shopId: shopId);
    for (final profile in profiles) {
      if (profile.isDefault) return profile;
    }
    return profiles.isEmpty ? null : profiles.first;
  }

  Future<LocalPrinterProfileRecord> save({
    String? id,
    required String shopId,
    required String name,
    required LocalPrinterConnectionType connectionType,
    String? deviceAddress,
    String? networkHost,
    int networkPort = 9100,
    int paperWidthMm = 80,
    int fontScalePercent = 100,
    bool isDefault = false,
  }) async {
    await _requireShop(shopId);
    final normalizedName = name.trim();
    if (normalizedName.isEmpty) {
      throw const FormatException('Printer name is required.');
    }
    if (paperWidthMm != 58 && paperWidthMm != 80) {
      throw const FormatException('Paper width must be 58mm or 80mm.');
    }
    if (fontScalePercent < 80 || fontScalePercent > 130) {
      throw const FormatException('Font scale must be between 80% and 130%.');
    }
    if (networkPort < 1 || networkPort > 65535) {
      throw const FormatException('Network printer port is invalid.');
    }
    final normalizedAddress = _optional(deviceAddress);
    final normalizedHost = _optional(networkHost);
    if (connectionType == LocalPrinterConnectionType.bluetooth &&
        normalizedAddress == null) {
      throw const FormatException('Bluetooth printer address is required.');
    }
    if (connectionType == LocalPrinterConnectionType.network &&
        normalizedHost == null) {
      throw const FormatException('Network printer host is required.');
    }
    final now = DateTime.now().toUtc().toIso8601String();
    final profileId = id ?? _uuid.v4();
    final existing =
        await (database.select(database.localPrinterProfiles)..where(
              (row) =>
                  row.id.equals(profileId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (id != null && existing == null) {
      throw StateError('Printer profile not found.');
    }
    final row = LocalPrinterProfilesCompanion.insert(
      id: profileId,
      merchantId: merchantId,
      shopId: shopId,
      name: normalizedName,
      connectionType: connectionType.name,
      deviceAddress: Value(normalizedAddress),
      networkHost: Value(normalizedHost),
      networkPort: Value(networkPort),
      paperWidthMm: Value(paperWidthMm),
      fontScalePercent: Value(fontScalePercent),
      isDefault: Value(isDefault),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );
    await database.transaction(() async {
      if (isDefault) {
        await (database.update(database.localPrinterProfiles)..where(
              (current) =>
                  current.merchantId.equals(merchantId) &
                  current.shopId.equals(shopId),
            ))
            .write(
              const LocalPrinterProfilesCompanion(isDefault: Value(false)),
            );
      }
      await database
          .into(database.localPrinterProfiles)
          .insertOnConflictUpdate(row);
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'UPDATE',
        entityType: 'printer_profile',
        entityId: profileId,
        shopId: shopId,
        beforeData: existing == null ? null : _rowMap(existing),
        afterData: {
          'name': normalizedName,
          'connection_type': connectionType.name,
          'paper_width_mm': paperWidthMm,
          'font_scale_percent': fontScalePercent,
          'is_default': isDefault,
        },
      );
    });
    return _fromRow(
      await (database.select(
        database.localPrinterProfiles,
      )..where((current) => current.id.equals(profileId))).getSingle(),
    );
  }

  Future<void> delete({required String shopId, required String id}) async {
    await _requireShop(shopId);
    final existing =
        await (database.select(database.localPrinterProfiles)..where(
              (row) =>
                  row.id.equals(id) &
                  row.merchantId.equals(merchantId) &
                  row.shopId.equals(shopId),
            ))
            .getSingleOrNull();
    if (existing == null) throw StateError('Printer profile not found.');
    await database.transaction(() async {
      await (database.delete(database.localPrinterProfiles)..where(
            (row) =>
                row.id.equals(id) &
                row.merchantId.equals(merchantId) &
                row.shopId.equals(shopId),
          ))
          .go();
      await LocalAuditRepository(
        database: database,
        merchantId: merchantId,
        actorMembershipId: actorMembershipId,
      ).record(
        action: 'DELETE',
        entityType: 'printer_profile',
        entityId: id,
        shopId: shopId,
        beforeData: _rowMap(existing),
      );
    });
  }

  Future<void> _requireShop(String shopId) async {
    final shop =
        await (database.select(database.shops)..where(
              (row) =>
                  row.id.equals(shopId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (shop == null) throw StateError('Shop is outside the merchant scope.');
  }

  LocalPrinterProfileRecord _fromRow(LocalPrinterProfile row) =>
      LocalPrinterProfileRecord(
        id: row.id,
        merchantId: row.merchantId,
        shopId: row.shopId,
        name: row.name,
        connectionType: LocalPrinterConnectionType.values.firstWhere(
          (value) => value.name == row.connectionType,
          orElse: () => LocalPrinterConnectionType.bluetooth,
        ),
        deviceAddress: row.deviceAddress,
        networkHost: row.networkHost,
        networkPort: row.networkPort,
        paperWidthMm: row.paperWidthMm,
        fontScalePercent: row.fontScalePercent,
        isDefault: row.isDefault,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      );

  Map<String, Object?> _rowMap(LocalPrinterProfile row) => {
    'id': row.id,
    'merchant_id': row.merchantId,
    'shop_id': row.shopId,
    'name': row.name,
    'connection_type': row.connectionType,
    'device_address': row.deviceAddress,
    'network_host': row.networkHost,
    'network_port': row.networkPort,
    'paper_width_mm': row.paperWidthMm,
    'font_scale_percent': row.fontScalePercent,
    'is_default': row.isDefault,
    'created_at': row.createdAt,
    'updated_at': row.updatedAt,
  };

  String? _optional(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }
}
