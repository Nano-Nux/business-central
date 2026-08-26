class MeasurementUnit {
  const MeasurementUnit({
    required this.id,
    required this.merchantId,
    required this.code,
    required this.name,
    required this.dimensionCode,
    required this.allowsDecimal,
    required this.isActive,
    this.symbol,
  });

  final String id;
  final String merchantId;
  final String code;
  final String name;
  final String? symbol;
  final String dimensionCode;
  final bool allowsDecimal;
  final bool isActive;

  factory MeasurementUnit.fromJson(Map<String, Object?> json) =>
      MeasurementUnit(
        id: json['id'] as String,
        merchantId: json['merchant_id'] as String? ?? '',
        code: json['code'] as String,
        name: json['name'] as String,
        symbol: json['symbol'] as String?,
        dimensionCode: json['dimension_code'] as String? ?? 'GENERAL',
        allowsDecimal: json['allows_decimal'] as bool? ?? true,
        isActive: json['is_active'] as bool? ?? true,
      );
}

class MeasurementConversion {
  const MeasurementConversion({
    required this.id,
    required this.merchantId,
    required this.fromUnitId,
    required this.toUnitId,
    required this.multiplier,
    required this.additiveOffset,
    required this.isActive,
  });

  final String id;
  final String merchantId;
  final String fromUnitId;
  final String toUnitId;
  final String multiplier;
  final String additiveOffset;
  final bool isActive;

  factory MeasurementConversion.fromJson(Map<String, Object?> json) =>
      MeasurementConversion(
        id: json['id'] as String,
        merchantId: json['merchant_id'] as String? ?? '',
        fromUnitId: json['from_unit_id'] as String,
        toUnitId: json['to_unit_id'] as String,
        multiplier: (json['multiplier'] ?? '1').toString(),
        additiveOffset: (json['additive_offset'] ?? '0').toString(),
        isActive: json['is_active'] as bool? ?? true,
      );
}
