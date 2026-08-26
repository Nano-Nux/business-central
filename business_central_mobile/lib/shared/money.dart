class MoneyFormatException implements Exception {
  const MoneyFormatException(this.message);
  final String message;
  @override
  String toString() => 'MoneyFormatException: $message';
}

/// Exact decimal money represented as integer minor units.
class ExactMoney {
  const ExactMoney({required this.minorUnits, required this.decimalPlaces});

  final BigInt minorUnits;
  final int decimalPlaces;

  factory ExactMoney.parse(String value, {required int decimalPlaces}) {
    if (decimalPlaces < 0 || decimalPlaces > 9) {
      throw const MoneyFormatException(
        'Decimal places must be between 0 and 9.',
      );
    }
    final input = value.trim();
    final match = RegExp(r'^([+-]?)(\d+)(?:\.(\d+))?$').firstMatch(input);
    if (match == null) {
      throw const MoneyFormatException('Money must be a decimal string.');
    }
    final fraction = match.group(3) ?? '';
    if (fraction.length > decimalPlaces) {
      throw const MoneyFormatException(
        'Money has more fractional digits than the currency allows.',
      );
    }
    final paddedFraction = fraction.padRight(decimalPlaces, '0');
    final digits = '${match.group(2)}$paddedFraction';
    final unsigned = BigInt.parse(digits);
    return ExactMoney(
      minorUnits: match.group(1) == '-' ? -unsigned : unsigned,
      decimalPlaces: decimalPlaces,
    );
  }

  ExactMoney operator +(ExactMoney other) {
    _checkScale(other);
    return ExactMoney(
      minorUnits: minorUnits + other.minorUnits,
      decimalPlaces: decimalPlaces,
    );
  }

  ExactMoney operator -(ExactMoney other) {
    _checkScale(other);
    return ExactMoney(
      minorUnits: minorUnits - other.minorUnits,
      decimalPlaces: decimalPlaces,
    );
  }

  ExactMoney get absolute =>
      ExactMoney(minorUnits: minorUnits.abs(), decimalPlaces: decimalPlaces);

  bool get isNegative => minorUnits.isNegative;

  String toDecimalString() {
    final negative = minorUnits.isNegative;
    final digits = minorUnits.abs().toString().padLeft(decimalPlaces + 1, '0');
    if (decimalPlaces == 0) return '${negative ? '-' : ''}$digits';
    final split = digits.length - decimalPlaces;
    return '${negative ? '-' : ''}${digits.substring(0, split)}.${digits.substring(split)}';
  }

  @override
  String toString() => toDecimalString();

  void _checkScale(ExactMoney other) {
    if (decimalPlaces != other.decimalPlaces) {
      throw const MoneyFormatException(
        'Cannot combine money with different currency scales.',
      );
    }
  }
}
