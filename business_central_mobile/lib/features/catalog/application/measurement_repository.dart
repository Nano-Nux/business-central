import '../domain/measurement_models.dart';

abstract interface class MeasurementRepository {
  Future<List<MeasurementUnit>> listUnits();
  Future<MeasurementUnit> createUnit({
    required String code,
    required String name,
    String? symbol,
    String dimensionCode,
    bool allowsDecimal,
  });
  Future<void> deleteUnit(String id);
  Future<List<MeasurementConversion>> listConversions();
  Future<MeasurementConversion> createConversion({
    required String fromUnitId,
    required String toUnitId,
    required String multiplier,
    String additiveOffset,
  });
  Future<void> deleteConversion(String id);
}
