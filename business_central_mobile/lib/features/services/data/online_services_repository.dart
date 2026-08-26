import '../../../features/auth/data/online_auth_api.dart';
import '../application/services_repository.dart';
import '../domain/service_models.dart';

class OnlineServicesRepository implements ServicesRepository {
  OnlineServicesRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<ServiceDefinition>> listCatalog() async => [
    for (final item in await api.getCollection(
      '/services/catalog?page_index=0&page_size=100',
    ))
      ServiceDefinition.fromJson(item),
  ];

  @override
  Future<ServiceDefinition> createDefinition({
    required String code,
    required String name,
    required String laborFee,
    String? description,
  }) async {
    final data = await api.postResource('/services/catalog', {
      'code': code.trim(),
      'name': name.trim(),
      'labor_fee': laborFee.trim(),
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
    });
    return ServiceDefinition.fromJson(data);
  }

  @override
  Future<void> deleteDefinition({required String id}) {
    return api.deleteResource('/services/catalog/$id');
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
    final data = await api.patchResource('/services/catalog/$id', {
      'code': code.trim(),
      'name': name.trim(),
      'labor_fee': laborFee.trim(),
      'description': description,
      ...?(durationMinutes == null
          ? null
          : {'duration_minutes': durationMinutes}),
      ...?(isActive == null ? null : {'is_active': isActive}),
    });
    return ServiceDefinition.fromJson(data);
  }

  @override
  Future<List<ServiceOrder>> listOrders({required String shopId}) async => [
    for (final item in await api.getCollection(
      '/services/orders?page_index=0&page_size=100',
    ))
      if (item['shop_id'] == shopId) ServiceOrder.fromJson(item),
  ];

  @override
  Future<ServiceOrder> createOrder({
    required String shopId,
    required String orderNumber,
    required String serviceType,
    required String priority,
  }) async {
    final data = await api.postResource('/services/orders', {
      'shop_id': shopId,
      'order_number': orderNumber.trim(),
      'service_type': serviceType.trim(),
      'priority': priority,
      'status': 'OPEN',
    });
    return ServiceOrder.fromJson(data);
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
    final data = await api.patchResource('/services/orders/$id', {
      'shop_id': shopId,
      'order_number': orderNumber.trim(),
      'service_type': serviceType.trim(),
      'status': status,
      'priority': priority,
    });
    return ServiceOrder.fromJson(data);
  }

  @override
  Future<void> deleteOrder({required String id}) {
    return api.deleteResource('/services/orders/$id');
  }

  @override
  Future<List<ServiceOrderItem>> listItems({required String orderId}) async => [
    for (final item in await api.getCollection(
      '/services/orders/$orderId/items?page_index=0&page_size=100',
    ))
      ServiceOrderItem.fromJson(item),
  ];

  @override
  Future<ServiceOrderItem> createItem({
    required String orderId,
    required String serviceId,
    required String description,
    required String quantity,
    required String unitPrice,
  }) async {
    final data = await api.postResource('/services/orders/$orderId/items', {
      'service_order_id': orderId,
      'service_id': serviceId,
      'description': description.trim(),
      'quantity': quantity.trim(),
      'unit_price': unitPrice.trim(),
      'status': 'OPEN',
    });
    return ServiceOrderItem.fromJson(data);
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
    final data = await api.patchResource('/services/items/$id', {
      'service_order_id': orderId,
      'service_id': serviceId,
      'description': description.trim(),
      'quantity': quantity.trim(),
      'unit_price': unitPrice.trim(),
      'status': status,
    });
    return ServiceOrderItem.fromJson(data);
  }

  @override
  Future<void> deleteItem({required String id}) {
    return api.deleteResource('/services/items/$id');
  }

  @override
  Future<List<ServiceAppointment>> listAppointments({
    required String orderId,
  }) async => [
    for (final item in await api.getCollection(
      '/services/orders/$orderId/appointments?page_index=0&page_size=100',
    ))
      ServiceAppointment.fromJson(item),
  ];

  @override
  Future<ServiceAppointment> createAppointment({
    required String orderId,
    required DateTime startsAt,
    required DateTime endsAt,
    required String status,
  }) async {
    final data = await api
        .postResource('/services/orders/$orderId/appointments', {
          'service_order_id': orderId,
          'starts_at': startsAt.toUtc().toIso8601String(),
          'ends_at': endsAt.toUtc().toIso8601String(),
          'status': status,
        });
    return ServiceAppointment.fromJson(data);
  }

  @override
  Future<ServiceAppointment> updateAppointment({
    required String id,
    required String orderId,
    required DateTime startsAt,
    required DateTime endsAt,
    required String status,
  }) async {
    final data = await api.patchResource('/services/appointments/$id', {
      'service_order_id': orderId,
      'starts_at': startsAt.toUtc().toIso8601String(),
      'ends_at': endsAt.toUtc().toIso8601String(),
      'status': status,
    });
    return ServiceAppointment.fromJson(data);
  }

  @override
  Future<void> deleteAppointment({required String id}) {
    return api.deleteResource('/services/appointments/$id');
  }

  @override
  Future<List<ServiceNote>> listNotes({required String orderId}) async => [
    for (final item in await api.getCollection(
      '/services/orders/$orderId/notes?page_index=0&page_size=100',
    ))
      ServiceNote.fromJson(item),
  ];

  @override
  Future<ServiceNote> createNote({
    required String orderId,
    required String note,
  }) async {
    final data = await api.postResource('/services/orders/$orderId/notes', {
      'service_order_id': orderId,
      'note': note.trim(),
    });
    return ServiceNote.fromJson(data);
  }

  @override
  Future<void> deleteNote({required String id}) {
    return api.deleteResource('/services/notes/$id');
  }

  @override
  Future<List<ServiceBilling>> listBillings({required String orderId}) async =>
      [
        for (final item in await api.getCollection(
          '/services/orders/$orderId/billings?page_index=0&page_size=100',
        ))
          ServiceBilling.fromJson(item),
      ];

  @override
  Future<ServiceBilling> createBilling({
    required String orderId,
    required String amount,
    required String status,
    String? promotionId,
  }) async {
    final data = await api.postResource('/services/orders/$orderId/billings', {
      'service_order_id': orderId,
      'amount': amount.trim(),
      'status': status,
      if (promotionId != null && promotionId.trim().isNotEmpty)
        'promotion_id': promotionId,
    });
    return ServiceBilling.fromJson(data);
  }

  @override
  Future<ServiceBilling> updateBilling({
    required String id,
    required String orderId,
    required String amount,
    required String status,
    String? promotionId,
  }) async {
    final data = await api.patchResource('/services/billings/$id', {
      'service_order_id': orderId,
      'amount': amount.trim(),
      'status': status,
      if (promotionId != null && promotionId.trim().isNotEmpty)
        'promotion_id': promotionId.trim(),
    });
    return ServiceBilling.fromJson(data);
  }

  @override
  Future<void> deleteBilling({required String id}) {
    return api.deleteResource('/services/billings/$id');
  }
}
