import '../domain/service_models.dart';

abstract interface class ServicesRepository {
  Future<List<ServiceDefinition>> listCatalog();

  Future<ServiceDefinition> createDefinition({
    required String code,
    required String name,
    required String laborFee,
    String? description,
  });

  Future<ServiceDefinition> updateDefinition({
    required String id,
    required String code,
    required String name,
    required String laborFee,
    String? description,
    int? durationMinutes,
    bool? isActive,
  });

  Future<void> deleteDefinition({required String id});

  Future<List<ServiceOrder>> listOrders({required String shopId});

  Future<ServiceOrder> createOrder({
    required String shopId,
    required String orderNumber,
    required String serviceType,
    required String priority,
  });

  Future<ServiceOrder> updateOrder({
    required String id,
    required String shopId,
    required String orderNumber,
    required String serviceType,
    required String status,
    required String priority,
  });

  Future<void> deleteOrder({required String id});

  Future<List<ServiceOrderItem>> listItems({required String orderId});

  Future<ServiceOrderItem> createItem({
    required String orderId,
    required String serviceId,
    required String description,
    required String quantity,
    required String unitPrice,
  });

  Future<ServiceOrderItem> updateItem({
    required String id,
    required String orderId,
    required String serviceId,
    required String description,
    required String quantity,
    required String unitPrice,
    required String status,
  });

  Future<void> deleteItem({required String id});

  Future<List<ServiceAppointment>> listAppointments({required String orderId});

  Future<ServiceAppointment> createAppointment({
    required String orderId,
    required DateTime startsAt,
    required DateTime endsAt,
    required String status,
  });

  Future<ServiceAppointment> updateAppointment({
    required String id,
    required String orderId,
    required DateTime startsAt,
    required DateTime endsAt,
    required String status,
  });

  Future<void> deleteAppointment({required String id});

  Future<List<ServiceNote>> listNotes({required String orderId});

  Future<ServiceNote> createNote({
    required String orderId,
    required String note,
  });

  Future<void> deleteNote({required String id});

  Future<List<ServiceBilling>> listBillings({required String orderId});

  Future<ServiceBilling> createBilling({
    required String orderId,
    required String amount,
    required String status,
    String? promotionId,
  });

  Future<ServiceBilling> updateBilling({
    required String id,
    required String orderId,
    required String amount,
    required String status,
    String? promotionId,
  });

  Future<void> deleteBilling({required String id});
}
