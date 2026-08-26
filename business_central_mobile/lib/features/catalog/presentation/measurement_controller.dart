import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../config/app_configuration.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../application/measurement_repository.dart';
import '../data/local_measurement_repository.dart';
import '../data/online_measurement_repository.dart';
import '../domain/measurement_models.dart';

final measurementRepositoryProvider = Provider<MeasurementRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    final merchantId = auth?.merchantId;
    if (merchantId == null) {
      throw const ConfigurationException(
        'Local workspace is not authenticated.',
      );
    }
    return LocalMeasurementRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: merchantId,
    );
  }
  return OnlineMeasurementRepository(ref.watch(onlineAuthApiProvider));
});

class MeasurementState {
  const MeasurementState({required this.units, required this.conversions});
  final List<MeasurementUnit> units;
  final List<MeasurementConversion> conversions;
}

final measurementControllerProvider =
    AsyncNotifierProvider<MeasurementController, MeasurementState>(
      MeasurementController.new,
    );

class MeasurementController extends AsyncNotifier<MeasurementState> {
  MeasurementRepository get _repository =>
      ref.read(measurementRepositoryProvider);

  @override
  Future<MeasurementState> build() async => _load();

  Future<MeasurementState> _load() async {
    final values = await Future.wait([
      _repository.listUnits(),
      _repository.listConversions(),
    ]);
    return MeasurementState(
      units: values[0] as List<MeasurementUnit>,
      conversions: values[1] as List<MeasurementConversion>,
    );
  }

  Future<void> createUnit({
    required String code,
    required String name,
    String? symbol,
    String dimensionCode = 'GENERAL',
    bool allowsDecimal = true,
  }) async {
    await _repository.createUnit(
      code: code,
      name: name,
      symbol: symbol,
      dimensionCode: dimensionCode,
      allowsDecimal: allowsDecimal,
    );
    state = await AsyncValue.guard(_load);
  }

  Future<void> deleteUnit(String id) async {
    await _repository.deleteUnit(id);
    state = await AsyncValue.guard(_load);
  }

  Future<void> createConversion({
    required String fromUnitId,
    required String toUnitId,
    required String multiplier,
    String additiveOffset = '0',
  }) async {
    await _repository.createConversion(
      fromUnitId: fromUnitId,
      toUnitId: toUnitId,
      multiplier: multiplier,
      additiveOffset: additiveOffset,
    );
    state = await AsyncValue.guard(_load);
  }

  Future<void> deleteConversion(String id) async {
    await _repository.deleteConversion(id);
    state = await AsyncValue.guard(_load);
  }
}
