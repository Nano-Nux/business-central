import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/catalog/data/local_measurement_repository.dart';

void main() {
  test('fully offline measurement graph stays merchant scoped', () async {
    final database = AppDatabase(executor: NativeDatabase.memory());
    addTearDown(database.closeForTest);
    final repository = LocalMeasurementRepository(
      database: database,
      merchantId: 'merchant-1',
    );

    final each = await repository.createUnit(
      code: 'ea',
      name: 'Each',
      dimensionCode: 'count',
      allowsDecimal: false,
    );
    final dozen = await repository.createUnit(
      code: 'dz',
      name: 'Dozen',
      dimensionCode: 'count',
    );
    final conversion = await repository.createConversion(
      fromUnitId: each.id,
      toUnitId: dozen.id,
      multiplier: '0.083333333333333333',
    );

    expect((await repository.listUnits()).map((unit) => unit.code).toList(), [
      'DZ',
      'EA',
    ]);
    expect((await repository.listConversions()).single.id, conversion.id);
    expect(
      repository.createConversion(
        fromUnitId: each.id,
        toUnitId: 'other-merchant-unit',
        multiplier: '1',
      ),
      throwsStateError,
    );
    expect(repository.deleteUnit(each.id), throwsStateError);
    await repository.deleteConversion(conversion.id);
    await repository.deleteUnit(each.id);
    await repository.deleteUnit(dozen.id);
    expect(await repository.listUnits(), isEmpty);
  });
}
