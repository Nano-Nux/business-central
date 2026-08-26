import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../application/measurement_repository.dart';
import '../domain/measurement_models.dart';

/// Standalone measurement graph used by FULLY_OFFLINE mode.
class LocalMeasurementRepository implements MeasurementRepository {
  LocalMeasurementRepository({
    required this.database,
    required this.merchantId,
  });

  final AppDatabase database;
  final String merchantId;
  static const _uuid = Uuid();

  @override
  Future<List<MeasurementUnit>> listUnits() async {
    final rows =
        await (database.select(database.localMeasurementUnits)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([(row) => OrderingTerm(expression: row.name)]))
            .get();
    return [
      for (final row in rows)
        MeasurementUnit(
          id: row.id,
          merchantId: row.merchantId,
          code: row.code,
          name: row.name,
          symbol: row.symbol,
          dimensionCode: row.dimensionCode,
          allowsDecimal: row.allowsDecimal,
          isActive: row.isActive,
        ),
    ];
  }

  @override
  Future<MeasurementUnit> createUnit({
    required String code,
    required String name,
    String? symbol,
    String dimensionCode = 'GENERAL',
    bool allowsDecimal = true,
  }) async {
    final id = _uuid.v4();
    await database
        .into(database.localMeasurementUnits)
        .insert(
          LocalMeasurementUnitsCompanion.insert(
            id: id,
            merchantId: merchantId,
            code: _required(code, 'Unit code').toUpperCase(),
            name: _required(name, 'Unit name'),
            symbol: Value(_optional(symbol)),
            dimensionCode: _required(dimensionCode, 'Dimension').toUpperCase(),
            allowsDecimal: Value(allowsDecimal),
            createdAt: _now(),
          ),
        );
    return (await listUnits()).firstWhere((unit) => unit.id == id);
  }

  @override
  Future<void> deleteUnit(String id) async {
    final references =
        await (database.select(database.localMeasurementConversions)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  (row.fromUnitId.equals(id) | row.toUnitId.equals(id)),
            ))
            .get();
    if (references.isNotEmpty) {
      throw StateError('Delete conversions before deleting this unit.');
    }
    final deleted =
        await (database.delete(database.localMeasurementUnits)..where(
              (row) => row.merchantId.equals(merchantId) & row.id.equals(id),
            ))
            .go();
    if (deleted == 0) throw StateError('Unit is outside the active merchant.');
  }

  @override
  Future<List<MeasurementConversion>> listConversions() async {
    final rows =
        await (database.select(database.localMeasurementConversions)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([(row) => OrderingTerm(expression: row.createdAt)]))
            .get();
    return [
      for (final row in rows)
        MeasurementConversion(
          id: row.id,
          merchantId: row.merchantId,
          fromUnitId: row.fromUnitId,
          toUnitId: row.toUnitId,
          multiplier: row.multiplier,
          additiveOffset: row.additiveOffset,
          isActive: row.isActive,
        ),
    ];
  }

  @override
  Future<MeasurementConversion> createConversion({
    required String fromUnitId,
    required String toUnitId,
    required String multiplier,
    String additiveOffset = '0',
  }) async {
    if (fromUnitId == toUnitId) {
      throw const FormatException('Conversion units must be different.');
    }
    await _requireUnit(fromUnitId);
    await _requireUnit(toUnitId);
    final normalizedMultiplier = _number(multiplier, 'Multiplier');
    final normalizedOffset = _number(additiveOffset, 'Additive offset');
    final id = _uuid.v4();
    await database
        .into(database.localMeasurementConversions)
        .insert(
          LocalMeasurementConversionsCompanion.insert(
            id: id,
            merchantId: merchantId,
            fromUnitId: fromUnitId,
            toUnitId: toUnitId,
            multiplier: normalizedMultiplier,
            additiveOffset: normalizedOffset,
            createdAt: _now(),
          ),
        );
    return (await listConversions()).firstWhere(
      (conversion) => conversion.id == id,
    );
  }

  @override
  Future<void> deleteConversion(String id) async {
    final deleted =
        await (database.delete(database.localMeasurementConversions)..where(
              (row) => row.merchantId.equals(merchantId) & row.id.equals(id),
            ))
            .go();
    if (deleted == 0) {
      throw StateError('Conversion is outside the active merchant.');
    }
  }

  Future<void> requireUnit(String id) => _requireUnit(id);

  Future<void> _requireUnit(String id) async {
    final unit =
        await (database.select(database.localMeasurementUnits)..where(
              (row) => row.merchantId.equals(merchantId) & row.id.equals(id),
            ))
            .getSingleOrNull();
    if (unit == null) throw StateError('Unit is outside the active merchant.');
  }

  String _required(String value, String label) {
    final normalized = value.trim();
    if (normalized.isEmpty) throw FormatException('$label is required.');
    return normalized;
  }

  String _number(String value, String label) {
    final normalized = _required(value, label);
    if (num.tryParse(normalized) == null) {
      throw FormatException('$label must be numeric.');
    }
    return normalized;
  }

  String? _optional(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  String _now() => DateTime.now().toUtc().toIso8601String();
}
