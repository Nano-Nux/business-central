class ServiceDefinition {
  const ServiceDefinition({
    required this.id,
    required this.merchantId,
    required this.code,
    required this.name,
    required this.isActive,
    required this.laborFee,
    this.categoryId,
    this.description,
    this.durationMinutes,
  });

  final String id;
  final String merchantId;
  final String code;
  final String name;
  final bool isActive;
  final String laborFee;
  final String? categoryId;
  final String? description;
  final int? durationMinutes;

  factory ServiceDefinition.fromJson(Map<String, Object?> json) {
    return ServiceDefinition(
      id: json['id'] as String,
      merchantId: json['merchant_id'] as String? ?? '',
      code: json['code'] as String,
      name: json['name'] as String,
      isActive: json['is_active'] as bool? ?? true,
      laborFee: (json['labor_fee'] ?? '0').toString(),
      categoryId: json['category_id'] as String?,
      description: json['description'] as String?,
      durationMinutes: json['duration_minutes'] as int?,
    );
  }
}

class ServiceOrder {
  const ServiceOrder({
    required this.id,
    required this.merchantId,
    required this.orderNumber,
    required this.serviceType,
    required this.status,
    required this.priority,
    required this.openedAt,
    this.shopId,
    this.orderId,
    this.customerId,
    this.completedAt,
  });

  final String id;
  final String merchantId;
  final String? shopId;
  final String? orderId;
  final String? customerId;
  final String orderNumber;
  final String serviceType;
  final String status;
  final String priority;
  final DateTime openedAt;
  final DateTime? completedAt;

  factory ServiceOrder.fromJson(Map<String, Object?> json) {
    return ServiceOrder(
      id: json['id'] as String,
      merchantId: json['merchant_id'] as String? ?? '',
      shopId: json['shop_id'] as String?,
      orderId: json['order_id'] as String?,
      customerId: json['customer_id'] as String?,
      orderNumber: json['order_number'] as String,
      serviceType: json['service_type'] as String,
      status: json['status'] as String,
      priority: json['priority'] as String,
      openedAt: DateTime.parse(json['opened_at'] as String).toUtc(),
      completedAt: json['completed_at'] == null
          ? null
          : DateTime.parse(json['completed_at'] as String).toUtc(),
    );
  }
}

class ServiceOrderItem {
  const ServiceOrderItem({
    required this.id,
    required this.serviceOrderId,
    required this.description,
    required this.quantity,
    required this.unitPrice,
    required this.status,
    this.serviceId,
    this.variantId,
  });

  final String id;
  final String serviceOrderId;
  final String? serviceId;
  final String? variantId;
  final String description;
  final String quantity;
  final String unitPrice;
  final String status;

  factory ServiceOrderItem.fromJson(Map<String, Object?> json) {
    return ServiceOrderItem(
      id: json['id'] as String,
      serviceOrderId: json['service_order_id'] as String,
      serviceId: json['service_id'] as String?,
      variantId: json['variant_id'] as String?,
      description: json['description'] as String,
      quantity: (json['quantity'] ?? '0').toString(),
      unitPrice: (json['unit_price'] ?? '0').toString(),
      status: json['status'] as String,
    );
  }
}

class ServiceAppointment {
  const ServiceAppointment({
    required this.id,
    required this.serviceOrderId,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    this.shopId,
  });

  final String id;
  final String serviceOrderId;
  final String? shopId;
  final DateTime startsAt;
  final DateTime endsAt;
  final String status;

  factory ServiceAppointment.fromJson(Map<String, Object?> json) {
    return ServiceAppointment(
      id: json['id'] as String,
      serviceOrderId: json['service_order_id'] as String,
      shopId: json['shop_id'] as String?,
      startsAt: DateTime.parse(json['starts_at'] as String).toUtc(),
      endsAt: DateTime.parse(json['ends_at'] as String).toUtc(),
      status: json['status'] as String,
    );
  }
}

class ServiceNote {
  const ServiceNote({
    required this.id,
    required this.serviceOrderId,
    required this.note,
    required this.createdAt,
  });

  final String id;
  final String serviceOrderId;
  final String note;
  final DateTime createdAt;

  factory ServiceNote.fromJson(Map<String, Object?> json) {
    return ServiceNote(
      id: json['id'] as String,
      serviceOrderId: json['service_order_id'] as String,
      note: json['note'] as String,
      createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
    );
  }
}

class ServiceBilling {
  const ServiceBilling({
    required this.id,
    required this.serviceOrderId,
    required this.amount,
    required this.status,
  });

  final String id;
  final String serviceOrderId;
  final String amount;
  final String status;

  factory ServiceBilling.fromJson(Map<String, Object?> json) {
    return ServiceBilling(
      id: json['id'] as String,
      serviceOrderId: json['service_order_id'] as String,
      amount: (json['amount'] ?? '0').toString(),
      status: json['status'] as String,
    );
  }
}
