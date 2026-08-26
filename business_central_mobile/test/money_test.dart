import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/shared/money.dart';

void main() {
  test('parses and adds money without binary floating point', () {
    final subtotal = ExactMoney.parse('10.10', decimalPlaces: 2);
    final tax = ExactMoney.parse('0.20', decimalPlaces: 2);
    expect((subtotal + tax).toDecimalString(), '10.30');
    expect((subtotal - tax).toDecimalString(), '9.90');
  });

  test('preserves signs and trailing zeros', () {
    expect(
      ExactMoney.parse('-1.5', decimalPlaces: 2).toDecimalString(),
      '-1.50',
    );
    expect(ExactMoney.parse('12', decimalPlaces: 0).toDecimalString(), '12');
  });

  test('rejects unsafe fractional precision and malformed values', () {
    expect(
      () => ExactMoney.parse('1.001', decimalPlaces: 2),
      throwsA(isA<MoneyFormatException>()),
    );
    expect(
      () => ExactMoney.parse('1e2', decimalPlaces: 2),
      throwsA(isA<MoneyFormatException>()),
    );
  });
}
