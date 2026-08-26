import 'dart:convert';

import 'package:drift/drift.dart';

import 'database_executor.dart';

part 'app_database.g.dart';

class AppMetadata extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

class Merchants extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get slug => text()();
  TextColumn get currencyCode => text().withLength(min: 3, max: 3)();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class UserIdentities extends Table {
  TextColumn get id => text()();
  TextColumn get email => text()();
  TextColumn get phone => text().nullable()();
  TextColumn get passwordHash => text()();
  TextColumn get passwordSalt => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get createdAt => text()();
  TextColumn get lastLoginAt => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {email},
  ];
}

class UserMemberships extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get identityId => text()();
  TextColumn get displayName => text()();
  TextColumn get shopId => text().nullable()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, identityId},
  ];
}

class Shops extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get name => text()();
  TextColumn get code => text()();
  TextColumn get footerNote => text().withDefault(const Constant(''))();
  TextColumn get timezone => text().withDefault(const Constant('UTC'))();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, code},
  ];
}

/// Device-local printer configuration. Printer pairing is intentionally not a
/// backend setting: a Bluetooth address belongs to the device that paired it.
class LocalPrinterProfiles extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text()();
  TextColumn get name => text()();
  TextColumn get connectionType => text()();
  TextColumn get deviceAddress => text().nullable()();
  TextColumn get networkHost => text().nullable()();
  IntColumn get networkPort => integer().withDefault(const Constant(9100))();
  IntColumn get paperWidthMm => integer().withDefault(const Constant(80))();
  IntColumn get fontScalePercent =>
      integer().withDefault(const Constant(100))();
  BoolColumn get isDefault => boolean().withDefault(const Constant(false))();
  TextColumn get createdAt => text()();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// Payload-preserving cache for canonical backend entities whose mobile
/// workflow is not enabled yet. This keeps a single tenant-scoped extension
/// point instead of introducing frontend-specific copies of backend models.
class LocalCanonicalRecords extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get shopId => text().nullable()();
  TextColumn get payloadJson => text()();
  IntColumn get sourceVersion => integer().nullable()();
  BoolColumn get isDeleted => boolean().withDefault(const Constant(false))();
  TextColumn get createdAt => text()();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, entityType, entityId},
  ];
}

class Roles extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get code => text()();
  TextColumn get name => text()();
  BoolColumn get isSystem => boolean().withDefault(const Constant(false))();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, code},
  ];
}

class Permissions extends Table {
  TextColumn get code => text()();
  TextColumn get description => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {code};
}

class MembershipRoles extends Table {
  TextColumn get merchantId => text()();
  TextColumn get membershipId => text()();
  TextColumn get roleId => text()();
  TextColumn get grantedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {merchantId, membershipId, roleId};
}

class RolePermissions extends Table {
  TextColumn get roleId => text()();
  TextColumn get permissionCode => text()();

  @override
  Set<Column<Object>> get primaryKey => {roleId, permissionCode};
}

class Modules extends Table {
  TextColumn get code => text()();
  TextColumn get name => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();

  @override
  Set<Column<Object>> get primaryKey => {code};
}

class MerchantModules extends Table {
  TextColumn get merchantId => text()();
  TextColumn get moduleCode => text()();
  TextColumn get status => text()();
  TextColumn get enabledAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {merchantId, moduleCode};
}

class ShopModules extends Table {
  TextColumn get merchantId => text()();
  TextColumn get shopId => text()();
  TextColumn get moduleCode => text()();

  @override
  Set<Column<Object>> get primaryKey => {merchantId, shopId, moduleCode};
}

class MerchantSettings extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text().nullable()();
  TextColumn get settingKey => text()();
  TextColumn get valueType => text()();
  TextColumn get valueJson => text()();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class Locations extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text().nullable()();
  TextColumn get code => text()();
  TextColumn get name => text()();
  TextColumn get locationType => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, code},
  ];
}

class CachedCatalogCategories extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get parentCategoryId => text().nullable()();
  TextColumn get name => text()();
  TextColumn get slug => text()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, slug},
  ];
}

class CachedCatalogProducts extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get name => text()();
  TextColumn get productType => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class CachedCatalogProductCategories extends Table {
  TextColumn get merchantId => text()();
  TextColumn get productId => text()();
  TextColumn get categoryId => text()();

  @override
  Set<Column<Object>> get primaryKey => {merchantId, productId, categoryId};
}

class CachedCatalogVariants extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get productId => text()();
  TextColumn get sku => text()();
  TextColumn get barcode => text().nullable()();
  TextColumn get name => text()();
  TextColumn get baseUnitId => text()();
  TextColumn get unitOfMeasure => text()();
  BoolColumn get isStockTracked =>
      boolean().withDefault(const Constant(false))();
  TextColumn get quantityOnHand => text().nullable()();
  TextColumn get price => text().nullable()();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, sku},
  ];
}

class LocalMeasurementUnits extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get code => text()();
  TextColumn get name => text()();
  TextColumn get symbol => text().nullable()();
  TextColumn get dimensionCode => text()();
  BoolColumn get allowsDecimal => boolean().withDefault(const Constant(true))();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, code},
  ];
}

class LocalMeasurementConversions extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get fromUnitId => text()();
  TextColumn get toUnitId => text()();
  TextColumn get multiplier => text()();
  TextColumn get additiveOffset => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, fromUnitId, toUnitId},
  ];
}

class LocalDeliveries extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text()();
  TextColumn get name => text()();
  TextColumn get contactInfo => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, shopId, name},
  ];
}

class LocalOrders extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text()();
  TextColumn get number => text()();
  TextColumn get status => text()();
  TextColumn get currencyCode => text()();
  TextColumn get subtotal => text()();
  TextColumn get discountTotal => text()();
  TextColumn get taxTotal => text()();
  TextColumn get grandTotal => text()();
  TextColumn get paymentMethod => text()();
  TextColumn get customerName => text().nullable()();
  TextColumn get customerPhone => text().nullable()();
  TextColumn get deliveryId => text().nullable()();
  TextColumn get note => text().nullable()();
  TextColumn get idempotencyKey => text()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, idempotencyKey},
  ];
}

class LocalOrderLines extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get orderId => text()();
  TextColumn get variantId => text()();
  TextColumn get sku => text()();
  TextColumn get name => text()();
  TextColumn get unitPrice => text()();
  IntColumn get quantity => integer()();
  TextColumn get discountAmount => text().withDefault(const Constant('0.00'))();
  TextColumn get taxAmount => text().withDefault(const Constant('0.00'))();
  TextColumn get lineTotal => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LocalPromotions extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get name => text()();
  TextColumn get promotionType => text()();
  TextColumn get value => text()();
  TextColumn get minimumSubtotal =>
      text().withDefault(const Constant('0.00'))();
  IntColumn get usageLimit => integer().nullable()();
  IntColumn get redemptionCount => integer().withDefault(const Constant(0))();
  DateTimeColumn get startsAt => dateTime().nullable()();
  DateTimeColumn get endsAt => dateTime().nullable()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LocalPromotionCodes extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get promotionId => text()();
  TextColumn get code => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  IntColumn get usageLimit => integer().nullable()();
  IntColumn get redemptionCount => integer().withDefault(const Constant(0))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, code},
  ];
}

class LocalPromotionScopes extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get promotionId => text()();
  TextColumn get productId => text()();
  TextColumn get variantId => text().nullable()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LocalOrderPromotions extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get orderId => text()();
  TextColumn get promotionId => text()();
  TextColumn get discountAmount => text()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, orderId, promotionId},
  ];
}

class LocalInventoryMovements extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text()();
  TextColumn get variantId => text()();
  TextColumn get movementType => text()();
  TextColumn get sourceLocationId => text().nullable()();
  TextColumn get destinationLocationId => text().nullable()();
  TextColumn get quantity => text()();
  TextColumn get unitId => text().nullable()();
  TextColumn get enteredQuantity => text().nullable()();
  TextColumn get unitCost => text().nullable()();
  TextColumn get receiptLineId => text().nullable()();
  TextColumn get purchaseOrderId => text().nullable()();
  TextColumn get purchaseOrderLineId => text().nullable()();
  TextColumn get receiptNumber => text().nullable()();
  TextColumn get batchNumber => text().nullable()();
  TextColumn get expiresAt => text().nullable()();
  TextColumn get totalCost => text()();
  TextColumn get eventKey => text()();
  TextColumn get orderLineId => text().nullable()();
  TextColumn get reversesMovementId => text().nullable()();
  TextColumn get occurredAt => text()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, eventKey},
  ];
}

class LocalInventoryCostLayers extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get variantId => text()();
  TextColumn get locationId => text()();
  TextColumn get receiptMovementId => text()();
  TextColumn get receiptLineId => text().nullable()();
  TextColumn get quantityReceived => text()();
  TextColumn get quantityRemaining => text()();
  TextColumn get unitCost => text()();
  TextColumn get transferredFromLayerId => text().nullable()();
  TextColumn get restoredFromAllocationId => text().nullable()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LocalInventoryCostAllocations extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get consumptionMovementId => text()();
  TextColumn get costLayerId => text()();
  TextColumn get quantity => text()();
  TextColumn get unitCost => text()();
  TextColumn get totalCost => text()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LocalPayments extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get orderId => text()();
  TextColumn get method => text()();
  TextColumn get status => text()();
  TextColumn get amount => text()();
  TextColumn get providerReference => text().nullable()();
  TextColumn get idempotencyKey => text()();
  TextColumn get capturedAt => text().nullable()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, idempotencyKey},
  ];
}

class LocalRefunds extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get paymentId => text()();
  TextColumn get orderId => text()();
  TextColumn get amount => text()();
  TextColumn get status => text()();
  TextColumn get reason => text().nullable()();
  TextColumn get idempotencyKey => text()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, idempotencyKey},
  ];
}

/// Append-only local projection of the canonical backend audit_events table.
///
/// The repository layer only exposes inserts and scoped reads. Sensitive
/// offline workflows write an event in the same SQLite transaction as the
/// business mutation so a committed mutation always has its audit record.
class LocalAuditEvents extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text().nullable()();
  TextColumn get actorMembershipId => text().nullable()();
  TextColumn get action => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text().nullable()();
  TextColumn get beforeData => text().nullable()();
  TextColumn get afterData => text().nullable()();
  TextColumn get requestId => text().nullable()();
  TextColumn get occurredAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LocalServiceRecords extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text().nullable()();
  TextColumn get entityType => text()();
  TextColumn get parentId => text().nullable()();
  TextColumn get serviceId => text().nullable()();
  TextColumn get code => text().nullable()();
  TextColumn get name => text().nullable()();
  TextColumn get description => text().nullable()();
  TextColumn get orderNumber => text().nullable()();
  TextColumn get serviceType => text().nullable()();
  TextColumn get priority => text().nullable()();
  TextColumn get status => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get quantity => text().nullable()();
  TextColumn get amount => text().nullable()();
  TextColumn get startsAt => text().nullable()();
  TextColumn get endsAt => text().nullable()();
  IntColumn get durationMinutes => integer().nullable()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class LocalRepairRecords extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text()();
  TextColumn get recordType => text()();
  TextColumn get parentId => text().nullable()();
  TextColumn get workItemId => text().nullable()();
  TextColumn get orderNumber => text().nullable()();
  TextColumn get deviceId => text().nullable()();
  TextColumn get deviceType => text().nullable()();
  TextColumn get manufacturer => text().nullable()();
  TextColumn get model => text().nullable()();
  TextColumn get serialNumber => text().nullable()();
  TextColumn get issueDescription => text().nullable()();
  TextColumn get priority => text().nullable()();
  TextColumn get customerName => text().nullable()();
  TextColumn get customerPhone => text().nullable()();
  TextColumn get status => text()();
  TextColumn get paymentStatus => text()();
  TextColumn get totalCost => text()();
  TextColumn get laborFee => text().nullable()();
  TextColumn get additionalFee => text().nullable()();
  TextColumn get taxAmount => text().nullable()();
  TextColumn get diagnosis => text().nullable()();
  TextColumn get estimatedCost => text().nullable()();
  TextColumn get kind => text().nullable()();
  TextColumn get method => text().nullable()();
  TextColumn get amount => text().nullable()();
  TextColumn get note => text().nullable()();
  TextColumn get customFields => text().nullable()();
  TextColumn get ticketFields => text().nullable()();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, orderNumber},
  ];
}

class LocalPriceLists extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get code => text()();
  TextColumn get currencyCode => text()();
  BoolColumn get isDefault => boolean().withDefault(const Constant(false))();
  TextColumn get createdAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, code},
  ];
}

class LocalPrices extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get priceListId => text()();
  TextColumn get variantId => text()();
  TextColumn get amount => text()();
  TextColumn get validFrom => text()();
  TextColumn get validUntil => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, priceListId, variantId},
  ];
}

class OperationQueue extends Table {
  TextColumn get operationId => text()();
  TextColumn get merchantId => text()();
  TextColumn get shopId => text().nullable()();
  TextColumn get deviceId => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get operationType => text()();
  TextColumn get payload => text()();
  TextColumn get payloadHash => text()();
  IntColumn get baseVersion => integer().nullable()();
  TextColumn get clientCreatedAt => text()();
  TextColumn get dependencyOperationId => text().nullable()();
  TextColumn get status => text()();
  IntColumn get retryCount => integer().withDefault(const Constant(0))();
  TextColumn get nextRetryAt => text().nullable()();
  TextColumn get lastError => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {operationId};
}

class SyncCheckpoints extends Table {
  TextColumn get merchantId => text()();
  TextColumn get scopeKey => text()();
  TextColumn get checkpoint => text()();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {merchantId, scopeKey};
}

class SyncDevices extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get membershipId => text().nullable()();
  TextColumn get deviceIdentifier => text()();
  TextColumn get deviceName => text().nullable()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  TextColumn get lastSeenAt => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {merchantId, deviceIdentifier},
  ];
}

class SyncSessions extends Table {
  TextColumn get id => text()();
  TextColumn get merchantId => text()();
  TextColumn get deviceId => text()();
  TextColumn get clientSessionKey => text()();
  TextColumn get status => text()();
  TextColumn get scopeKey => text()();
  IntColumn get lastServerSequence =>
      integer().withDefault(const Constant(0))();
  TextColumn get startedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class SyncEntityVersions extends Table {
  TextColumn get merchantId => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  IntColumn get version => integer()();
  TextColumn get payload => text()();
  TextColumn get updatedAt => text()();

  @override
  Set<Column<Object>> get primaryKey => {merchantId, entityType, entityId};
}

@DriftDatabase(
  tables: [
    AppMetadata,
    Merchants,
    UserIdentities,
    UserMemberships,
    Shops,
    LocalPrinterProfiles,
    LocalCanonicalRecords,
    Roles,
    Permissions,
    MembershipRoles,
    RolePermissions,
    Modules,
    MerchantModules,
    ShopModules,
    MerchantSettings,
    Locations,
    CachedCatalogCategories,
    CachedCatalogProducts,
    CachedCatalogProductCategories,
    CachedCatalogVariants,
    LocalMeasurementUnits,
    LocalMeasurementConversions,
    LocalDeliveries,
    LocalOrders,
    LocalOrderLines,
    LocalPromotions,
    LocalPromotionCodes,
    LocalPromotionScopes,
    LocalOrderPromotions,
    LocalInventoryMovements,
    LocalInventoryCostLayers,
    LocalInventoryCostAllocations,
    LocalPayments,
    LocalRefunds,
    LocalAuditEvents,
    LocalServiceRecords,
    LocalRepairRecords,
    LocalPriceLists,
    LocalPrices,
    OperationQueue,
    SyncCheckpoints,
    SyncDevices,
    SyncSessions,
    SyncEntityVersions,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase({QueryExecutor? executor, String? encryptionKey})
    : super(executor ?? openDatabaseExecutor(encryptionKey: encryptionKey));

  @override
  int get schemaVersion => 27;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) => m.createAll(),
    onUpgrade: (Migrator m, int from, int to) async {
      if (from < 2) {
        await m.createTable(cachedCatalogCategories);
        await m.createTable(cachedCatalogProducts);
        await m.createTable(cachedCatalogProductCategories);
        await m.createTable(cachedCatalogVariants);
      }
      if (from >= 2 && from < 3) {
        await m.addColumn(
          cachedCatalogCategories,
          cachedCatalogCategories.sortOrder,
        );
      }
      if (from < 4) {
        await m.createTable(localOrders);
        await m.createTable(localOrderLines);
      }
      if (from < 5) {
        await m.createTable(localInventoryMovements);
      }
      if (from < 6) {
        await m.createTable(localServiceRecords);
      }
      if (from >= 6 && from < 7) {
        await m.addColumn(
          localServiceRecords,
          localServiceRecords.durationMinutes,
        );
      }
      if (from < 8) {
        await m.createTable(localRepairRecords);
      }
      if (from < 9) {
        await m.createTable(localPriceLists);
        await m.createTable(localPrices);
      }
      if (from < 10) {
        await m.addColumn(shops, shops.timezone);
      }
      if (from < 11) {
        await m.createTable(syncSessions);
      }
      if (from < 12) {
        await m.createTable(syncEntityVersions);
      }
      if (from < 13) {
        await m.addColumn(merchantSettings, merchantSettings.shopId);
      }
      if (from < 14) {
        await m.createTable(localMeasurementUnits);
        await m.createTable(localMeasurementConversions);
      }
      if (from < 15) {
        await m.createTable(localDeliveries);
        await m.addColumn(localOrders, localOrders.deliveryId);
      }
      if (from < 16) {
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.unitId,
        );
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.enteredQuantity,
        );
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.receiptLineId,
        );
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.reversesMovementId,
        );
        await m.createTable(localInventoryCostLayers);
        await m.createTable(localInventoryCostAllocations);
      }
      if (from < 17) {
        await m.createTable(localPayments);
        await m.createTable(localRefunds);
      }
      if (from < 18) {
        await m.addColumn(localRefunds, localRefunds.idempotencyKey);
      }
      if (from < 19) {
        await customStatement(
          'ALTER TABLE user_identities ADD COLUMN phone TEXT',
        );
      }
      if (from < 20) {
        await m.createTable(localAuditEvents);
      }
      if (from < 21) {
        await m.createTable(localPrinterProfiles);
      }
      if (from < 22) {
        await m.createTable(localCanonicalRecords);
      }
      if (from < 23) {
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.purchaseOrderId,
        );
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.purchaseOrderLineId,
        );
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.receiptNumber,
        );
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.batchNumber,
        );
        await m.addColumn(
          localInventoryMovements,
          localInventoryMovements.expiresAt,
        );
      }
      if (from < 24) {
        await m.addColumn(localOrderLines, localOrderLines.discountAmount);
        await m.addColumn(localOrderLines, localOrderLines.taxAmount);
        await m.createTable(localPromotions);
        await m.createTable(localPromotionCodes);
        await m.createTable(localPromotionScopes);
        await m.createTable(localOrderPromotions);
      }
      if (from < 25) {
        await m.addColumn(localRepairRecords, localRepairRecords.customFields);
      }
      if (from < 26) {
        await m.addColumn(localRepairRecords, localRepairRecords.ticketFields);
      }
      if (from < 27) {
        await m.addColumn(localRepairRecords, localRepairRecords.workItemId);
      }
    },
    beforeOpen: (details) async {
      await customStatement('PRAGMA foreign_keys = ON');
      await into(appMetadata).insertOnConflictUpdate(
        AppMetadataCompanion.insert(
          key: 'schema_version',
          value: schemaVersion.toString(),
          updatedAt: DateTime.now().toUtc().toIso8601String(),
        ),
      );
    },
  );

  Future<void> closeForTest() => close();

  Future<void> enqueueOperation({
    required String operationId,
    required String merchantId,
    String? shopId,
    required String deviceId,
    required String entityType,
    required String entityId,
    required String operationType,
    required Map<String, Object?> payload,
    required String payloadHash,
    int? baseVersion,
    String? dependencyOperationId,
  }) {
    return into(operationQueue).insert(
      OperationQueueCompanion.insert(
        operationId: operationId,
        merchantId: merchantId,
        shopId: Value(shopId),
        deviceId: deviceId,
        entityType: entityType,
        entityId: entityId,
        operationType: operationType,
        payload: jsonEncode(payload),
        payloadHash: payloadHash,
        baseVersion: Value(baseVersion),
        clientCreatedAt: DateTime.now().toUtc().toIso8601String(),
        dependencyOperationId: Value(dependencyOperationId),
        status: 'PENDING',
      ),
    );
  }

  Stream<List<OperationQueueData>> watchPendingOperations(String merchantId) {
    return (select(operationQueue)
          ..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.status.equals('PENDING'),
          )
          ..orderBy([(row) => OrderingTerm(expression: row.clientCreatedAt)]))
        .watch();
  }

  Stream<List<OperationQueueData>> watchOperationQueue(String merchantId) {
    return (select(operationQueue)
          ..where((row) => row.merchantId.equals(merchantId))
          ..orderBy([(row) => OrderingTerm(expression: row.clientCreatedAt)]))
        .watch();
  }

  Future<List<OperationQueueData>> pendingOperations(String merchantId) {
    return (select(operationQueue)
          ..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.status.equals('PENDING'),
          )
          ..orderBy([(row) => OrderingTerm(expression: row.clientCreatedAt)]))
        .get();
  }

  Future<OperationQueueData?> operationForEntity({
    required String merchantId,
    required String entityType,
    required String entityId,
    required String operationType,
  }) {
    return (select(operationQueue)..where(
          (row) =>
              row.merchantId.equals(merchantId) &
              row.entityType.equals(entityType) &
              row.entityId.equals(entityId) &
              row.operationType.equals(operationType),
        ))
        .getSingleOrNull();
  }

  Future<void> updateOperation(
    String operationId, {
    required String status,
    int? retryCount,
    String? nextRetryAt,
    String? lastError,
  }) {
    return (update(
      operationQueue,
    )..where((row) => row.operationId.equals(operationId))).write(
      OperationQueueCompanion(
        status: Value(status),
        retryCount: retryCount == null
            ? const Value.absent()
            : Value(retryCount),
        nextRetryAt: Value(nextRetryAt),
        lastError: Value(lastError),
      ),
    );
  }

  Future<SyncCheckpoint?> syncCheckpoint(String merchantId, String scopeKey) {
    return (select(syncCheckpoints)..where(
          (row) =>
              row.merchantId.equals(merchantId) & row.scopeKey.equals(scopeKey),
        ))
        .getSingleOrNull();
  }

  Future<void> saveSyncCheckpoint({
    required String merchantId,
    required String scopeKey,
    required String checkpoint,
  }) {
    return into(syncCheckpoints).insertOnConflictUpdate(
      SyncCheckpointsCompanion.insert(
        merchantId: merchantId,
        scopeKey: scopeKey,
        checkpoint: checkpoint,
        updatedAt: DateTime.now().toUtc().toIso8601String(),
      ),
    );
  }

  Future<SyncEntityVersion?> syncEntityVersion({
    required String merchantId,
    required String entityType,
    required String entityId,
  }) {
    return (select(syncEntityVersions)..where(
          (row) =>
              row.merchantId.equals(merchantId) &
              row.entityType.equals(entityType) &
              row.entityId.equals(entityId),
        ))
        .getSingleOrNull();
  }

  Future<void> saveSyncEntityVersion({
    required String merchantId,
    required String entityType,
    required String entityId,
    required int version,
    required Map<String, Object?> payload,
  }) {
    return into(syncEntityVersions).insertOnConflictUpdate(
      SyncEntityVersionsCompanion.insert(
        merchantId: merchantId,
        entityType: entityType,
        entityId: entityId,
        version: version,
        payload: jsonEncode(payload),
        updatedAt: DateTime.now().toUtc().toIso8601String(),
      ),
    );
  }
}
