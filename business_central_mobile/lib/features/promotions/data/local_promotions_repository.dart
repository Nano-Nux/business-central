import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../../../core/database/local_audit_repository.dart';
import '../../../shared/money.dart';
import '../application/promotions_repository.dart';
import '../domain/promotion_models.dart';

/// Fully-offline promotion authority.
///
/// Promotion data is always filtered by [merchantId]. The repository mirrors
/// the backend's promotion eligibility rules and records each mutation in the
/// append-only local audit log.
class LocalPromotionsRepository implements PromotionsRepository {
  LocalPromotionsRepository({
    required this.database,
    required this.merchantId,
    this.actorMembershipId,
  });

  final AppDatabase database;
  final String merchantId;
  final String? actorMembershipId;
  static const _uuid = Uuid();

  @override
  Future<List<PromotionRecord>> list() async {
    final rows =
        await (database.select(database.localPromotions)
              ..where((row) => row.merchantId.equals(merchantId))
              ..orderBy([
                (row) => OrderingTerm.desc(row.createdAt),
                (row) => OrderingTerm.asc(row.name),
              ]))
            .get();
    return [for (final row in rows) _promotion(row)];
  }

  @override
  Future<PromotionRecord> create({
    required String name,
    required String promotionType,
    required String value,
    String? minimumSubtotal,
    int? usageLimit,
    DateTime? startsAt,
    DateTime? endsAt,
  }) async {
    final normalizedName = _required(name, 'Promotion name');
    final normalizedType = promotionType.trim().toUpperCase();
    if (!{'PERCENTAGE', 'FIXED_AMOUNT'}.contains(normalizedType)) {
      throw const FormatException('Unsupported promotion type.');
    }
    final normalizedValue = _money(value, 'Promotion value');
    if (normalizedValue.isNegative) {
      throw const FormatException('Promotion value must be zero or greater.');
    }
    if (normalizedType == 'PERCENTAGE' &&
        normalizedValue.minorUnits > BigInt.from(10000)) {
      throw const FormatException('Percentage promotions cannot exceed 100.');
    }
    final normalizedMinimum = _money(
      minimumSubtotal == null || minimumSubtotal.trim().isEmpty
          ? '0.00'
          : minimumSubtotal,
      'Promotion minimum subtotal',
    );
    if (normalizedMinimum.isNegative) {
      throw const FormatException(
        'Promotion minimum subtotal must be zero or greater.',
      );
    }
    _validateUsageLimit(usageLimit);
    final starts = startsAt?.toUtc();
    final ends = endsAt?.toUtc();
    if (starts != null && ends != null && !ends.isAfter(starts)) {
      throw const FormatException('Promotion end must be after its start.');
    }
    final id = _uuid.v4();
    final now = DateTime.now().toUtc();
    await database.transaction(() async {
      await database
          .into(database.localPromotions)
          .insert(
            LocalPromotionsCompanion.insert(
              id: id,
              merchantId: merchantId,
              name: normalizedName,
              promotionType: normalizedType,
              value: normalizedValue.toDecimalString(),
              minimumSubtotal: Value(normalizedMinimum.toDecimalString()),
              usageLimit: Value(usageLimit),
              startsAt: Value(starts),
              endsAt: Value(ends),
              createdAt: now.toIso8601String(),
            ),
          );
      await _audit.record(
        action: 'CREATE',
        entityType: 'promotion',
        entityId: id,
        afterData: {
          'name': normalizedName,
          'promotion_type': normalizedType,
          'value': normalizedValue.toDecimalString(),
          'minimum_subtotal': normalizedMinimum.toDecimalString(),
          'usage_limit': usageLimit,
          'starts_at': starts?.toIso8601String(),
          'ends_at': ends?.toIso8601String(),
        },
      );
    });
    return _promotion(await _findPromotion(id));
  }

  @override
  Future<void> delete(String id) async {
    final promotion = await _findPromotionOrNull(id);
    if (promotion == null) {
      throw StateError('Promotion is outside the active merchant.');
    }
    final applied =
        await (database.select(database.localOrderPromotions)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.promotionId.equals(id),
            ))
            .getSingleOrNull();
    if (applied != null) {
      throw StateError(
        'A redeemed promotion cannot be deleted from local history.',
      );
    }
    final repairParts =
        await (database.select(database.localRepairRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.recordType.equals('PART'),
            ))
            .get();
    if (repairParts.any((row) {
      final value = row.note;
      if (value == null || value.isEmpty) return false;
      final decoded = jsonDecode(value);
      return decoded is Map && decoded['promotion_id'] == id;
    })) {
      throw StateError(
        'A redeemed promotion cannot be deleted from local history.',
      );
    }
    await database.transaction(() async {
      await (database.delete(database.localPromotionCodes)..where(
            (row) =>
                row.merchantId.equals(merchantId) & row.promotionId.equals(id),
          ))
          .go();
      await (database.delete(database.localPromotionScopes)..where(
            (row) =>
                row.merchantId.equals(merchantId) & row.promotionId.equals(id),
          ))
          .go();
      final deleted =
          await (database.delete(database.localPromotions)..where(
                (row) => row.merchantId.equals(merchantId) & row.id.equals(id),
              ))
              .go();
      if (deleted == 0) {
        throw StateError('Promotion is outside the active merchant.');
      }
      await _audit.record(
        action: 'DELETE',
        entityType: 'promotion',
        entityId: id,
        beforeData: _promotionData(promotion),
      );
    });
  }

  @override
  Future<List<PromotionCode>> listCodes(String promotionId) async {
    await _requirePromotion(promotionId);
    final rows =
        await (database.select(database.localPromotionCodes)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.promotionId.equals(promotionId),
              )
              ..orderBy([(row) => OrderingTerm.asc(row.code)]))
            .get();
    return [
      for (final row in rows)
        PromotionCode(
          id: row.id,
          promotionId: row.promotionId,
          code: row.code,
          isActive: row.isActive,
          redemptionCount: row.redemptionCount,
          usageLimit: row.usageLimit,
        ),
    ];
  }

  @override
  Future<PromotionCode> createCode({
    required String promotionId,
    required String code,
    int? usageLimit,
  }) async {
    await _requirePromotion(promotionId);
    final normalizedCode = _required(code, 'Promotion code');
    _validateUsageLimit(usageLimit);
    final duplicate =
        await (database.select(database.localPromotionCodes)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.code.equals(normalizedCode),
            ))
            .getSingleOrNull();
    if (duplicate != null) {
      throw const FormatException('Promotion code already exists.');
    }
    final id = _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();
    await database.transaction(() async {
      await database
          .into(database.localPromotionCodes)
          .insert(
            LocalPromotionCodesCompanion.insert(
              id: id,
              merchantId: merchantId,
              promotionId: promotionId,
              code: normalizedCode,
              usageLimit: Value(usageLimit),
              createdAt: now,
            ),
          );
      await _audit.record(
        action: 'CREATE',
        entityType: 'promotion_code',
        entityId: id,
        afterData: {
          'promotion_id': promotionId,
          'code': normalizedCode,
          'usage_limit': usageLimit,
        },
      );
    });
    final row =
        await (database.select(database.localPromotionCodes)..where(
              (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
            ))
            .getSingle();
    return PromotionCode(
      id: row.id,
      promotionId: row.promotionId,
      code: row.code,
      isActive: row.isActive,
      redemptionCount: row.redemptionCount,
      usageLimit: row.usageLimit,
    );
  }

  @override
  Future<void> deleteCode(String id) async {
    final row =
        await (database.select(database.localPromotionCodes)..where(
              (entry) =>
                  entry.id.equals(id) & entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (row == null) {
      throw StateError('Promotion code is outside the active merchant.');
    }
    if (row.redemptionCount > 0) {
      throw StateError(
        'A redeemed promotion code cannot be deleted from local history.',
      );
    }
    await database.transaction(() async {
      await (database.delete(database.localPromotionCodes)..where(
            (entry) =>
                entry.id.equals(id) & entry.merchantId.equals(merchantId),
          ))
          .go();
      await _audit.record(
        action: 'DELETE',
        entityType: 'promotion_code',
        entityId: id,
        beforeData: {'promotion_id': row.promotionId, 'code': row.code},
      );
    });
  }

  @override
  Future<List<PromotionProductScope>> listProductScopes(
    String promotionId,
  ) async {
    await _requirePromotion(promotionId);
    final rows =
        await (database.select(database.localPromotionScopes)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.promotionId.equals(promotionId),
            ))
            .get();
    final products = await (database.select(
      database.cachedCatalogProducts,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final variants = await (database.select(
      database.cachedCatalogVariants,
    )..where((row) => row.merchantId.equals(merchantId))).get();
    final productsById = {for (final row in products) row.id: row};
    final variantsById = {for (final row in variants) row.id: row};
    return [
      for (final row in rows)
        PromotionProductScope(
          id: row.id,
          promotionId: row.promotionId,
          productId: row.productId,
          productName: productsById[row.productId]?.name ?? row.productId,
          variantId: row.variantId,
          variantName: row.variantId == null
              ? null
              : variantsById[row.variantId]?.name,
        ),
    ];
  }

  @override
  Future<void> assignProductScope({
    required String promotionId,
    required String productId,
    String? variantId,
  }) async {
    await _requirePromotion(promotionId);
    final product =
        await (database.select(database.cachedCatalogProducts)..where(
              (row) =>
                  row.id.equals(productId) & row.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (product == null) {
      throw StateError('Product is outside the active merchant.');
    }
    final normalizedVariant = variantId?.trim();
    if (normalizedVariant != null && normalizedVariant.isNotEmpty) {
      final variant =
          await (database.select(database.cachedCatalogVariants)..where(
                (row) =>
                    row.id.equals(normalizedVariant) &
                    row.merchantId.equals(merchantId),
              ))
              .getSingleOrNull();
      if (variant == null || variant.productId != productId) {
        throw const FormatException(
          'Promotion variant must belong to the supplied product.',
        );
      }
    }
    final duplicate =
        await (database.select(database.localPromotionScopes)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.promotionId.equals(promotionId) &
                  row.productId.equals(productId) &
                  (normalizedVariant == null || normalizedVariant.isEmpty
                      ? row.variantId.isNull()
                      : row.variantId.equals(normalizedVariant)),
            ))
            .getSingleOrNull();
    if (duplicate != null) return;
    final id = _uuid.v4();
    await database.transaction(() async {
      await database
          .into(database.localPromotionScopes)
          .insert(
            LocalPromotionScopesCompanion.insert(
              id: id,
              merchantId: merchantId,
              promotionId: promotionId,
              productId: productId,
              variantId: Value(
                normalizedVariant == null || normalizedVariant.isEmpty
                    ? null
                    : normalizedVariant,
              ),
              createdAt: DateTime.now().toUtc().toIso8601String(),
            ),
          );
      await _audit.record(
        action: 'CREATE',
        entityType: 'promotion_scope',
        entityId: id,
        afterData: {
          'promotion_id': promotionId,
          'product_id': productId,
          'variant_id': normalizedVariant,
        },
      );
    });
  }

  @override
  Future<void> removeProductScope(String id) async {
    final row =
        await (database.select(database.localPromotionScopes)..where(
              (entry) =>
                  entry.id.equals(id) & entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (row == null) {
      throw StateError('Promotion scope is outside the active merchant.');
    }
    await database.transaction(() async {
      await (database.delete(database.localPromotionScopes)..where(
            (entry) =>
                entry.id.equals(id) & entry.merchantId.equals(merchantId),
          ))
          .go();
      await _audit.record(
        action: 'DELETE',
        entityType: 'promotion_scope',
        entityId: id,
        beforeData: {
          'promotion_id': row.promotionId,
          'product_id': row.productId,
          'variant_id': row.variantId,
        },
      );
    });
  }

  Future<LocalPromotion> _findPromotion(String id) async =>
      (await _findPromotionOrNull(id)) ??
      (throw StateError('Promotion is outside the active merchant.'));

  Future<LocalPromotion?> _findPromotionOrNull(String id) =>
      (database.select(database.localPromotions)..where(
            (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
          ))
          .getSingleOrNull();

  Future<LocalPromotion> _requirePromotion(String id) => _findPromotion(id);

  PromotionRecord _promotion(LocalPromotion row) => PromotionRecord(
    id: row.id,
    name: row.name,
    promotionType: row.promotionType,
    value: row.value,
    minimumSubtotal: row.minimumSubtotal,
    redemptionCount: row.redemptionCount,
    usageLimit: row.usageLimit,
    isActive: row.isActive,
    startsAt: row.startsAt?.toUtc(),
    endsAt: row.endsAt?.toUtc(),
  );

  Map<String, Object?> _promotionData(LocalPromotion row) => {
    'name': row.name,
    'promotion_type': row.promotionType,
    'value': row.value,
    'minimum_subtotal': row.minimumSubtotal,
    'usage_limit': row.usageLimit,
    'redemption_count': row.redemptionCount,
    'starts_at': row.startsAt?.toUtc().toIso8601String(),
    'ends_at': row.endsAt?.toUtc().toIso8601String(),
    'is_active': row.isActive,
  };

  void _validateUsageLimit(int? value) {
    if (value != null && value <= 0) {
      throw const FormatException('Usage limit must be greater than zero.');
    }
  }

  ExactMoney _money(String value, String label) {
    try {
      return ExactMoney.parse(value.trim(), decimalPlaces: 2);
    } on Object {
      throw FormatException('$label must be a decimal amount.');
    }
  }

  String _required(String value, String label) {
    final normalized = value.trim();
    if (normalized.isEmpty) throw FormatException('$label is required.');
    return normalized;
  }

  LocalAuditRepository get _audit => LocalAuditRepository(
    database: database,
    merchantId: merchantId,
    actorMembershipId: actorMembershipId,
  );
}
