import '../../../features/auth/data/online_auth_api.dart';
import '../application/measurement_repository.dart';
import '../domain/measurement_models.dart';

class OnlineMeasurementRepository implements MeasurementRepository {
  OnlineMeasurementRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<MeasurementUnit>> listUnits() async => [
    for (final value in await api.getCollection(
      '/units?page_index=0&page_size=200',
    ))
      MeasurementUnit.fromJson(value),
  ];

  @override
  Future<MeasurementUnit> createUnit({
    required String code,
    required String name,
    String? symbol,
    String dimensionCode = 'GENERAL',
    bool allowsDecimal = true,
  }) async => MeasurementUnit.fromJson(
    await api.postResource('/units', {
      'code': code.trim(),
      'name': name.trim(),
      if (symbol != null && symbol.trim().isNotEmpty) 'symbol': symbol.trim(),
      'dimension_code': dimensionCode.trim().isEmpty
          ? 'GENERAL'
          : dimensionCode.trim().toUpperCase(),
      'allows_decimal': allowsDecimal,
    }),
  );

  @override
  Future<void> deleteUnit(String id) => api.deleteResource('/units/$id');

  @override
  Future<List<MeasurementConversion>> listConversions() async => [
    for (final value in await api.getCollection(
      '/unit-conversions?page_index=0&page_size=200',
    ))
      MeasurementConversion.fromJson(value),
  ];

  @override
  Future<MeasurementConversion> createConversion({
    required String fromUnitId,
    required String toUnitId,
    required String multiplier,
    String additiveOffset = '0',
  }) async => MeasurementConversion.fromJson(
    await api.postResource('/unit-conversions', {
      'from_unit_id': fromUnitId,
      'to_unit_id': toUnitId,
      'multiplier': multiplier.trim(),
      'additive_offset': additiveOffset.trim(),
    }),
  );

  @override
  Future<void> deleteConversion(String id) =>
      api.deleteResource('/unit-conversions/$id');
}
