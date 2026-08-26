import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/app_database.dart';
import '../application/services_repository.dart';
import '../domain/service_models.dart';

class LocalServicesRepository implements ServicesRepository {
  LocalServicesRepository({required this.database, required this.merchantId});

  final AppDatabase database;
  final String merchantId;
  static const _uuid = Uuid();

  @override
  Future<List<ServiceDefinition>> listCatalog() async {
    final rows = await _records('DEFINITION');
    return [
      for (final row in rows)
        ServiceDefinition(
          id: row.id,
          merchantId: merchantId,
          code: row.code ?? '',
          name: row.name ?? '',
          isActive: row.isActive,
          laborFee: row.amount ?? '0.00',
          description: row.description,
          durationMinutes: row.durationMinutes,
        ),
    ];
  }

  @override
  Future<ServiceDefinition> createDefinition({
    required String code,
    required String name,
    required String laborFee,
    String? description,
  }) async {
    final id = _uuid.v4();
    await database
        .into(database.localServiceRecords)
        .insert(
          _companion(
            id: id,
            entityType: 'DEFINITION',
            code: _required(code, 'Service code'),
            name: _required(name, 'Service name'),
            description: _optional(description),
            amount: laborFee.trim(),
            status: 'ACTIVE',
            createdAt: _now(),
          ),
        );
    return (await listCatalog()).firstWhere((row) => row.id == id);
  }

  @override
  Future<ServiceDefinition> updateDefinition({
    required String id,
    required String code,
    required String name,
    required String laborFee,
    String? description,
    int? durationMinutes,
    bool? isActive,
  }) async {
    final updated =
        await (database.update(database.localServiceRecords)..where(
              (row) =>
                  row.id.equals(id) &
                  row.merchantId.equals(merchantId) &
                  row.entityType.equals('DEFINITION'),
            ))
            .write(
              LocalServiceRecordsCompanion(
                code: Value(_required(code, 'Service code')),
                name: Value(_required(name, 'Service name')),
                description: Value(_optional(description)),
                amount: Value(laborFee.trim()),
                isActive: Value(isActive ?? true),
                durationMinutes: Value(durationMinutes),
              ),
            );
    if (updated == 0) {
      throw StateError('Service is outside the active merchant.');
    }
    return (await listCatalog()).firstWhere((row) => row.id == id);
  }

  @override
  Future<void> deleteDefinition({required String id}) async {
    final deleted =
        await (database.delete(database.localServiceRecords)..where(
              (row) =>
                  row.id.equals(id) &
                  row.merchantId.equals(merchantId) &
                  row.entityType.equals('DEFINITION'),
            ))
            .go();
    if (deleted == 0) {
      throw StateError('Service is outside the active merchant.');
    }
  }

  @override
  Future<List<ServiceOrder>> listOrders({required String shopId}) async {
    final rows =
        await (database.select(database.localServiceRecords)
              ..where(
                (row) =>
                    row.merchantId.equals(merchantId) &
                    row.entityType.equals('ORDER') &
                    row.shopId.equals(shopId),
              )
              ..orderBy([(row) => OrderingTerm.desc(row.createdAt)]))
            .get();
    return [for (final row in rows) _order(row)];
  }

  @override
  Future<ServiceOrder> createOrder({
    required String shopId,
    required String orderNumber,
    required String serviceType,
    required String priority,
  }) async {
    await _requireShop(shopId);
    final id = _uuid.v4();
    await database
        .into(database.localServiceRecords)
        .insert(
          _companion(
            id: id,
            entityType: 'ORDER',
            shopId: shopId,
            orderNumber: _required(orderNumber, 'Order number'),
            serviceType: _required(serviceType, 'Service type'),
            priority: priority,
            status: 'OPEN',
            createdAt: _now(),
          ),
        );
    return _order(await _single(id));
  }

  @override
  Future<ServiceOrder> updateOrder({
    required String id,
    required String shopId,
    required String orderNumber,
    required String serviceType,
    required String status,
    required String priority,
  }) async {
    await _requireShop(shopId);
    final updated =
        await (database.update(database.localServiceRecords)..where(
              (row) =>
                  row.id.equals(id) &
                  row.merchantId.equals(merchantId) &
                  row.entityType.equals('ORDER'),
            ))
            .write(
              LocalServiceRecordsCompanion(
                shopId: Value(shopId),
                orderNumber: Value(_required(orderNumber, 'Order number')),
                serviceType: Value(_required(serviceType, 'Service type')),
                status: Value(status),
                priority: Value(priority),
              ),
            );
    if (updated == 0) {
      throw StateError('Service order is outside the active merchant.');
    }
    return _order(await _single(id));
  }

  @override
  Future<void> deleteOrder({required String id}) async {
    final deleted =
        await (database.delete(database.localServiceRecords)..where(
              (row) =>
                  (row.id.equals(id) | row.parentId.equals(id)) &
                  row.merchantId.equals(merchantId),
            ))
            .go();
    if (deleted == 0) {
      throw StateError('Service order is outside the active merchant.');
    }
  }

  @override
  Future<List<ServiceOrderItem>> listItems({required String orderId}) async {
    await _requireOrder(orderId);
    final rows =
        await (database.select(database.localServiceRecords)..where(
              (row) =>
                  row.merchantId.equals(merchantId) &
                  row.parentId.equals(orderId) &
                  row.entityType.equals('ITEM'),
            ))
            .get();
    return [for (final row in rows) _item(row)];
  }

  @override
  Future<ServiceOrderItem> createItem({
    required String orderId,
    required String serviceId,
    required String description,
    required String quantity,
    required String unitPrice,
  }) async {
    await _requireOrder(orderId);
    final id = _uuid.v4();
    await database
        .into(database.localServiceRecords)
        .insert(
          _companion(
            id: id,
            entityType: 'ITEM',
            parentId: orderId,
            serviceId: serviceId,
            description: _required(description, 'Item description'),
            quantity: quantity.trim(),
            amount: unitPrice.trim(),
            status: 'OPEN',
            createdAt: _now(),
          ),
        );
    return _item(await _single(id));
  }

  @override
  Future<ServiceOrderItem> updateItem({
    required String id,
    required String orderId,
    required String serviceId,
    required String description,
    required String quantity,
    required String unitPrice,
    required String status,
  }) async {
    await _requireOrder(orderId);
    final updated =
        await (database.update(database.localServiceRecords)..where(
              (row) =>
                  row.id.equals(id) &
                  row.parentId.equals(orderId) &
                  row.merchantId.equals(merchantId) &
                  row.entityType.equals('ITEM'),
            ))
            .write(
              LocalServiceRecordsCompanion(
                serviceId: Value(serviceId),
                description: Value(_required(description, 'Item description')),
                quantity: Value(quantity.trim()),
                amount: Value(unitPrice.trim()),
                status: Value(status),
              ),
            );
    if (updated == 0) {
      throw StateError('Service item is outside the active merchant.');
    }
    return _item(await _single(id));
  }

  @override
  Future<void> deleteItem({required String id}) async =>
      _deleteEntity(id, 'ITEM');

  @override
  Future<List<ServiceAppointment>> listAppointments({
    required String orderId,
  }) async {
    await _requireOrder(orderId);
    final rows = await _children(orderId, 'APPOINTMENT');
    return [for (final row in rows) _appointment(row)];
  }

  @override
  Future<ServiceAppointment> createAppointment({
    required String orderId,
    required DateTime startsAt,
    required DateTime endsAt,
    required String status,
  }) async {
    final order = await _requireOrder(orderId);
    final id = _uuid.v4();
    await database
        .into(database.localServiceRecords)
        .insert(
          _companion(
            id: id,
            entityType: 'APPOINTMENT',
            parentId: orderId,
            shopId: order.shopId,
            status: status,
            startsAt: startsAt.toUtc().toIso8601String(),
            endsAt: endsAt.toUtc().toIso8601String(),
            createdAt: _now(),
          ),
        );
    return _appointment(await _single(id));
  }

  @override
  Future<ServiceAppointment> updateAppointment({
    required String id,
    required String orderId,
    required DateTime startsAt,
    required DateTime endsAt,
    required String status,
  }) async {
    final updated =
        await (database.update(database.localServiceRecords)..where(
              (row) =>
                  row.id.equals(id) &
                  row.parentId.equals(orderId) &
                  row.merchantId.equals(merchantId) &
                  row.entityType.equals('APPOINTMENT'),
            ))
            .write(
              LocalServiceRecordsCompanion(
                startsAt: Value(startsAt.toUtc().toIso8601String()),
                endsAt: Value(endsAt.toUtc().toIso8601String()),
                status: Value(status),
              ),
            );
    if (updated == 0) {
      throw StateError('Appointment is outside the active merchant.');
    }
    return _appointment(await _single(id));
  }

  @override
  Future<void> deleteAppointment({required String id}) =>
      _deleteEntity(id, 'APPOINTMENT');

  @override
  Future<List<ServiceNote>> listNotes({required String orderId}) async {
    await _requireOrder(orderId);
    final rows = await _children(orderId, 'NOTE');
    return [for (final row in rows) _note(row)];
  }

  @override
  Future<ServiceNote> createNote({
    required String orderId,
    required String note,
  }) async {
    await _requireOrder(orderId);
    final id = _uuid.v4();
    await database
        .into(database.localServiceRecords)
        .insert(
          _companion(
            id: id,
            entityType: 'NOTE',
            parentId: orderId,
            description: _required(note, 'Note'),
            status: 'RECORDED',
            createdAt: _now(),
          ),
        );
    return _note(await _single(id));
  }

  @override
  Future<void> deleteNote({required String id}) => _deleteEntity(id, 'NOTE');

  @override
  Future<List<ServiceBilling>> listBillings({required String orderId}) async {
    await _requireOrder(orderId);
    final rows = await _children(orderId, 'BILLING');
    return [for (final row in rows) _billing(row)];
  }

  @override
  Future<ServiceBilling> createBilling({
    required String orderId,
    required String amount,
    required String status,
    String? promotionId,
  }) async {
    await _requireOrder(orderId);
    if (promotionId?.trim().isNotEmpty ?? false) {
      throw const FormatException(
        'Local standalone service billing cannot apply a promotion until it is linked to a canonical order.',
      );
    }
    final id = _uuid.v4();
    await database
        .into(database.localServiceRecords)
        .insert(
          _companion(
            id: id,
            entityType: 'BILLING',
            parentId: orderId,
            amount: amount.trim(),
            status: status,
            createdAt: _now(),
          ),
        );
    return _billing(await _single(id));
  }

  @override
  Future<ServiceBilling> updateBilling({
    required String id,
    required String orderId,
    required String amount,
    required String status,
    String? promotionId,
  }) async {
    if (promotionId?.trim().isNotEmpty ?? false) {
      throw const FormatException(
        'Local standalone service billing cannot apply a promotion until it is linked to a canonical order.',
      );
    }
    final updated =
        await (database.update(database.localServiceRecords)..where(
              (row) =>
                  row.id.equals(id) &
                  row.parentId.equals(orderId) &
                  row.merchantId.equals(merchantId) &
                  row.entityType.equals('BILLING'),
            ))
            .write(
              LocalServiceRecordsCompanion(
                amount: Value(amount.trim()),
                status: Value(status),
              ),
            );
    if (updated == 0) {
      throw StateError('Billing is outside the active merchant.');
    }
    return _billing(await _single(id));
  }

  @override
  Future<void> deleteBilling({required String id}) =>
      _deleteEntity(id, 'BILLING');

  Future<List<LocalServiceRecord>> _records(String entityType) =>
      (database.select(database.localServiceRecords)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.entityType.equals(entityType),
          ))
          .get();

  Future<List<LocalServiceRecord>> _children(String parentId, String type) =>
      (database.select(database.localServiceRecords)..where(
            (row) =>
                row.merchantId.equals(merchantId) &
                row.parentId.equals(parentId) &
                row.entityType.equals(type),
          ))
          .get();

  Future<LocalServiceRecord> _single(String id) =>
      (database.select(database.localServiceRecords)..where(
            (row) => row.id.equals(id) & row.merchantId.equals(merchantId),
          ))
          .getSingle();

  Future<LocalServiceRecord> _requireOrder(String id) async {
    final row =
        await (database.select(database.localServiceRecords)..where(
              (entry) =>
                  entry.id.equals(id) &
                  entry.merchantId.equals(merchantId) &
                  entry.entityType.equals('ORDER'),
            ))
            .getSingleOrNull();
    if (row == null) {
      throw StateError('Service order is outside the active merchant.');
    }
    return row;
  }

  Future<void> _requireShop(String shopId) async {
    final row =
        await (database.select(database.shops)..where(
              (entry) =>
                  entry.id.equals(shopId) & entry.merchantId.equals(merchantId),
            ))
            .getSingleOrNull();
    if (row == null) throw StateError('Shop is outside the active merchant.');
  }

  Future<void> _deleteEntity(String id, String entityType) async {
    final deleted =
        await (database.delete(database.localServiceRecords)..where(
              (row) =>
                  row.id.equals(id) &
                  row.merchantId.equals(merchantId) &
                  row.entityType.equals(entityType),
            ))
            .go();
    if (deleted == 0) {
      throw StateError('Service record is outside the active merchant.');
    }
  }

  ServiceOrder _order(LocalServiceRecord row) => ServiceOrder(
    id: row.id,
    merchantId: merchantId,
    shopId: row.shopId,
    orderNumber: row.orderNumber ?? '',
    serviceType: row.serviceType ?? '',
    status: row.status,
    priority: row.priority ?? 'NORMAL',
    openedAt: DateTime.parse(row.createdAt).toUtc(),
    completedAt: row.status == 'COMPLETED'
        ? DateTime.parse(row.createdAt).toUtc()
        : null,
  );

  ServiceOrderItem _item(LocalServiceRecord row) => ServiceOrderItem(
    id: row.id,
    serviceOrderId: row.parentId ?? '',
    serviceId: row.serviceId,
    description: row.description ?? '',
    quantity: row.quantity ?? '0',
    unitPrice: row.amount ?? '0.00',
    status: row.status,
  );

  ServiceAppointment _appointment(LocalServiceRecord row) => ServiceAppointment(
    id: row.id,
    serviceOrderId: row.parentId ?? '',
    shopId: row.shopId,
    startsAt: DateTime.parse(row.startsAt!).toUtc(),
    endsAt: DateTime.parse(row.endsAt!).toUtc(),
    status: row.status,
  );

  ServiceNote _note(LocalServiceRecord row) => ServiceNote(
    id: row.id,
    serviceOrderId: row.parentId ?? '',
    note: row.description ?? '',
    createdAt: DateTime.parse(row.createdAt).toUtc(),
  );

  ServiceBilling _billing(LocalServiceRecord row) => ServiceBilling(
    id: row.id,
    serviceOrderId: row.parentId ?? '',
    amount: row.amount ?? '0.00',
    status: row.status,
  );

  LocalServiceRecordsCompanion _companion({
    required String id,
    required String entityType,
    required String status,
    required String createdAt,
    String? shopId,
    String? parentId,
    String? serviceId,
    String? code,
    String? name,
    String? description,
    String? orderNumber,
    String? serviceType,
    String? priority,
    String? quantity,
    String? amount,
    String? startsAt,
    String? endsAt,
    int? durationMinutes,
  }) => LocalServiceRecordsCompanion.insert(
    id: id,
    merchantId: merchantId,
    shopId: Value(shopId),
    entityType: entityType,
    parentId: Value(parentId),
    serviceId: Value(serviceId),
    code: Value(code),
    name: Value(name),
    description: Value(description),
    orderNumber: Value(orderNumber),
    serviceType: Value(serviceType),
    priority: Value(priority),
    status: status,
    quantity: Value(quantity),
    amount: Value(amount),
    startsAt: Value(startsAt),
    endsAt: Value(endsAt),
    durationMinutes: Value(durationMinutes),
    createdAt: createdAt,
  );

  String _required(String value, String label) {
    if (value.trim().isEmpty) throw FormatException('$label is required.');
    return value.trim();
  }

  String? _optional(String? value) =>
      value == null || value.trim().isEmpty ? null : value.trim();

  String _now() => DateTime.now().toUtc().toIso8601String();
}
