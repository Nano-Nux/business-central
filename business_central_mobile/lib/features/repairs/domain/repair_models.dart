class RepairWorkItemInput {
  const RepairWorkItemInput({
    this.id,
    required this.deviceType,
    required this.issueDescription,
    this.issues = const [],
    this.conditions = const [],
    this.manufacturer,
    this.model,
    this.serialNumber,
    this.note,
    this.fields,
  });

  final String? id;
  final String deviceType;
  final String issueDescription;
  final List<String> issues;
  final List<String> conditions;
  final String? manufacturer;
  final String? model;
  final String? serialNumber;
  final String? note;
  final Map<String, Object?>? fields;

  RepairWorkItemInput withId(String value) => RepairWorkItemInput(
    id: value,
    deviceType: deviceType,
    issueDescription: issueDescription,
    issues: issues,
    conditions: conditions,
    manufacturer: manufacturer,
    model: model,
    serialNumber: serialNumber,
    note: note,
    fields: fields,
  );

  Map<String, Object?> toJson() => {
    if (id?.trim().isNotEmpty == true) 'id': id!.trim(),
    'type': 'DEVICE',
    'device': {
      'device_type': deviceType.trim(),
      if (manufacturer?.trim().isNotEmpty == true)
        'manufacturer': manufacturer!.trim(),
      if (model?.trim().isNotEmpty == true) 'model': model!.trim(),
      if (serialNumber?.trim().isNotEmpty == true)
        'serial_number': serialNumber!.trim(),
    },
    'issue_description': issueDescription.trim(),
    'issues': [
      if (issueDescription.trim().isNotEmpty) issueDescription.trim(),
      for (final issue in issues)
        if (issue.trim().isNotEmpty) issue.trim(),
    ],
    'conditions': [
      for (final condition in conditions)
        if (condition.trim().isNotEmpty) condition.trim(),
    ],
    if (note?.trim().isNotEmpty == true) 'note': note!.trim(),
    if (fields != null && fields!.isNotEmpty) 'fields': fields,
  };
}

class RepairFormField {
  const RepairFormField({
    required this.id,
    required this.entityType,
    required this.fieldScope,
    required this.fieldCode,
    required this.label,
    required this.valueType,
    required this.isRequired,
    required this.options,
    required this.validationRules,
    required this.visibilityRules,
    required this.displayOrder,
    this.section,
    this.printable = false,
    this.formVersion = 1,
  });

  final String id;
  final String entityType;
  final String fieldScope;
  final String fieldCode;
  final String label;
  final String valueType;
  final bool isRequired;
  final List<Object?> options;
  final Map<String, Object?> validationRules;
  final Map<String, Object?> visibilityRules;
  final int displayOrder;
  final String? section;
  final bool printable;
  final int formVersion;

  factory RepairFormField.fromJson(Map<String, Object?> json) {
    final rawOptions = json['options'];
    final rawValidation = json['validation_rules'];
    final rawVisibility = json['visibility_rules'];
    return RepairFormField(
      id: json['id'] as String,
      entityType: json['entity_type'] as String? ?? 'REPAIR_WORK_ITEM',
      fieldScope: json['field_scope'] as String? ?? 'WORK_ITEM',
      fieldCode: json['field_code'] as String,
      label: json['label'] as String? ?? json['field_code'] as String,
      valueType: (json['value_type'] as String? ?? 'TEXT').toUpperCase(),
      isRequired: json['is_required'] as bool? ?? false,
      options: rawOptions is List ? List<Object?>.from(rawOptions) : const [],
      validationRules: rawValidation is Map
          ? rawValidation.map((key, value) => MapEntry(key.toString(), value))
          : const {},
      visibilityRules: rawVisibility is Map
          ? rawVisibility.map((key, value) => MapEntry(key.toString(), value))
          : const {},
      displayOrder: (json['display_order'] as num?)?.toInt() ?? 0,
      section: json['section'] as String?,
      printable: json['printable'] as bool? ?? false,
      formVersion: (json['form_version'] as num?)?.toInt() ?? 1,
    );
  }
}

class RepairRecord {
  const RepairRecord({
    required this.id,
    required this.orderNumber,
    required this.shopId,
    required this.status,
    required this.issueDescription,
    required this.receivedAt,
    required this.paymentStatus,
    required this.totalCost,
    this.customerName,
    this.customerPhone,
    this.deviceId,
    this.serviceOrderId,
    this.laborFee,
    this.additionalFee,
    this.taxAmount,
    this.fields = const {},
  });

  final String id;
  final String orderNumber;
  final String shopId;
  final String status;
  final String issueDescription;
  final DateTime receivedAt;
  final String paymentStatus;
  final String totalCost;
  final String? customerName;
  final String? customerPhone;
  final String? deviceId;
  final String? serviceOrderId;
  final String? laborFee;
  final String? additionalFee;
  final String? taxAmount;
  final Map<String, Object?> fields;

  factory RepairRecord.fromJson(Map<String, Object?> json) {
    final shopId = json['shop_id'] as String?;
    if (shopId == null || shopId.isEmpty) {
      throw StateError('Repair record is missing shop scope.');
    }
    return RepairRecord(
      id: json['id'] as String,
      orderNumber: json['order_number'] as String,
      shopId: shopId,
      status: json['status'] as String? ?? 'RECEIVED',
      issueDescription: json['issue_description'] as String? ?? '',
      receivedAt: DateTime.parse(json['received_at'] as String).toUtc(),
      paymentStatus: json['payment_status'] as String? ?? 'UNPAID',
      totalCost: (json['total_cost'] ?? '0').toString(),
      customerName: json['customer_name'] as String?,
      customerPhone: json['customer_phone'] as String?,
      deviceId: json['device_id'] as String?,
      serviceOrderId: json['service_order_id'] as String?,
      laborFee: json['labor_fee']?.toString(),
      additionalFee: json['additional_fee']?.toString(),
      taxAmount: json['tax_amount']?.toString(),
      fields: _fieldMap(json['fields']),
    );
  }

  static Map<String, Object?> _fieldMap(Object? value) => value is Map
      ? value.map((key, item) => MapEntry(key.toString(), item))
      : const {};
}

class RepairWorkItem {
  const RepairWorkItem({
    required this.id,
    required this.serviceOrderId,
    required this.sequenceNumber,
    required this.type,
    required this.status,
    required this.deviceType,
    required this.issueDescription,
    this.issues = const [],
    this.conditions = const [],
    this.formVersion = 1,
    this.manufacturer,
    this.model,
    this.serialNumber,
    this.note,
    this.fields = const {},
  });

  final String id;
  final String serviceOrderId;
  final int sequenceNumber;
  final String type;
  final String status;
  final int formVersion;
  final String deviceType;
  final String? manufacturer;
  final String? model;
  final String? serialNumber;
  final String issueDescription;
  final List<String> issues;
  final List<String> conditions;
  final String? note;
  final Map<String, Object?> fields;

  factory RepairWorkItem.fromJson(Map<String, Object?> json) {
    final device = json['device'] as Map<String, Object?>? ?? const {};
    final rawFields = json['fields'];
    return RepairWorkItem(
      id: json['id'] as String,
      serviceOrderId: json['service_order_id'] as String,
      sequenceNumber: (json['sequence_number'] as num?)?.toInt() ?? 1,
      type: json['type'] as String? ?? 'DEVICE',
      status: json['status'] as String? ?? 'OPEN',
      formVersion: (json['form_version'] as num?)?.toInt() ?? 1,
      deviceType: device['device_type'] as String? ?? '',
      manufacturer: device['manufacturer'] as String?,
      model: device['model'] as String?,
      serialNumber: device['serial_number'] as String?,
      issueDescription: json['issue_description'] as String? ?? '',
      issues: [
        for (final value in json['issues'] as List<Object?>? ?? const [])
          value.toString(),
      ],
      conditions: [
        for (final value in json['conditions'] as List<Object?>? ?? const [])
          value.toString(),
      ],
      note: json['note'] as String?,
      fields: rawFields is Map
          ? rawFields.map((key, value) => MapEntry(key.toString(), value))
          : const {},
    );
  }
}

class RepairTicketResult {
  const RepairTicketResult({
    required this.repairOrderId,
    required this.orderNumber,
  });
  final String repairOrderId;
  final String orderNumber;

  factory RepairTicketResult.fromJson(Map<String, Object?> json) {
    final repairOrder = json['repair_order']! as Map<String, Object?>;
    return RepairTicketResult(
      repairOrderId: repairOrder['id'] as String,
      orderNumber: repairOrder['order_number'] as String,
    );
  }
}

class RepairDiagnostic {
  const RepairDiagnostic({
    required this.id,
    required this.repairOrderId,
    required this.diagnosis,
    required this.createdAt,
    this.estimatedCost,
    this.workItemId,
  });

  final String id;
  final String repairOrderId;
  final String diagnosis;
  final DateTime createdAt;
  final String? estimatedCost;
  final String? workItemId;

  factory RepairDiagnostic.fromJson(Map<String, Object?> json) {
    return RepairDiagnostic(
      id: json['id'] as String,
      repairOrderId: json['repair_order_id'] as String,
      diagnosis: json['diagnosis'] as String,
      createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
      estimatedCost: json['estimated_cost']?.toString(),
      workItemId: json['work_item_id'] as String?,
    );
  }
}

class RepairPayment {
  const RepairPayment({
    required this.id,
    required this.repairOrderId,
    required this.kind,
    required this.method,
    required this.status,
    required this.amount,
    required this.createdAt,
  });

  final String id;
  final String repairOrderId;
  final String kind;
  final String method;
  final String status;
  final String amount;
  final DateTime createdAt;

  factory RepairPayment.fromJson(Map<String, Object?> json) {
    return RepairPayment(
      id: json['id'] as String,
      repairOrderId: json['repair_order_id'] as String,
      kind: json['kind'] as String,
      method: json['method'] as String,
      status: json['status'] as String,
      amount: (json['amount'] ?? '0').toString(),
      createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
    );
  }
}

class RepairRefund {
  const RepairRefund({
    required this.id,
    required this.repairOrderId,
    required this.paymentId,
    required this.status,
    required this.amount,
    required this.createdAt,
    this.reason,
  });

  final String id;
  final String repairOrderId;
  final String paymentId;
  final String status;
  final String amount;
  final String? reason;
  final DateTime createdAt;

  factory RepairRefund.fromJson(Map<String, Object?> json) => RepairRefund(
    id: json['id'] as String,
    repairOrderId: json['repair_order_id'] as String,
    paymentId: json['payment_id'] as String,
    status: json['status'] as String,
    amount: (json['amount'] ?? '0').toString(),
    reason: json['reason'] as String?,
    createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
  );
}

class RepairImage {
  const RepairImage({
    required this.id,
    required this.repairOrderId,
    required this.filename,
    required this.contentType,
    required this.createdAt,
    this.dataBase64,
    this.workItemId,
  });

  final String id;
  final String repairOrderId;
  final String filename;
  final String contentType;
  final String? dataBase64;
  final DateTime createdAt;
  final String? workItemId;

  factory RepairImage.fromJson(Map<String, Object?> json) => RepairImage(
    id: json['id'] as String,
    repairOrderId: json['repair_order_id'] as String,
    filename: json['filename'] as String? ?? 'image',
    contentType: json['content_type'] as String? ?? 'application/octet-stream',
    dataBase64: json['data_base64'] as String?,
    workItemId: json['work_item_id'] as String?,
    createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
  );
}

class RepairPart {
  const RepairPart({
    required this.id,
    required this.repairOrderId,
    required this.quantity,
    required this.unitPrice,
    required this.status,
    this.variantId,
    this.customerSuppliedPartId,
    this.repairTotal,
    this.workItemId,
  });

  final String id;
  final String repairOrderId;
  final String? variantId;
  final String? customerSuppliedPartId;
  final String quantity;
  final String unitPrice;
  final String status;
  final String? repairTotal;
  final String? workItemId;

  factory RepairPart.fromJson(Map<String, Object?> json) => RepairPart(
    id: json['id'] as String,
    repairOrderId: json['repair_order_id'] as String,
    variantId: json['variant_id'] as String?,
    customerSuppliedPartId: json['customer_supplied_part_id'] as String?,
    quantity: (json['quantity'] ?? '0').toString(),
    unitPrice: (json['unit_price'] ?? '0').toString(),
    status: json['status'] as String? ?? 'USED',
    repairTotal: json['repair_total']?.toString(),
    workItemId: json['work_item_id'] as String?,
  );
}

class RepairApproval {
  const RepairApproval({
    required this.id,
    required this.repairOrderId,
    required this.approvalVersion,
    required this.status,
    required this.createdAt,
    this.approvedAmount,
    this.approvedAt,
    this.workItemId,
  });

  final String id;
  final String repairOrderId;
  final int approvalVersion;
  final String status;
  final String? approvedAmount;
  final DateTime? approvedAt;
  final DateTime createdAt;
  final String? workItemId;

  factory RepairApproval.fromJson(Map<String, Object?> json) => RepairApproval(
    id: json['id'] as String,
    repairOrderId: json['repair_order_id'] as String,
    approvalVersion: (json['approval_version'] as num?)?.toInt() ?? 1,
    status: json['status'] as String? ?? 'PENDING',
    approvedAmount: json['approved_amount']?.toString(),
    approvedAt: _optionalDate(json['approved_at']),
    createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
    workItemId: json['work_item_id'] as String?,
  );
}

class RepairWarranty {
  const RepairWarranty({
    required this.id,
    required this.repairOrderId,
    required this.startsAt,
    required this.endsAt,
    this.terms,
    this.workItemId,
  });

  final String id;
  final String repairOrderId;
  final DateTime startsAt;
  final DateTime endsAt;
  final String? terms;
  final String? workItemId;

  factory RepairWarranty.fromJson(Map<String, Object?> json) => RepairWarranty(
    id: json['id'] as String,
    repairOrderId: json['repair_order_id'] as String,
    startsAt: DateTime.parse(json['starts_at'] as String).toUtc(),
    endsAt: DateTime.parse(json['ends_at'] as String).toUtc(),
    terms: json['terms'] as String?,
    workItemId: json['work_item_id'] as String?,
  );
}

DateTime? _optionalDate(Object? value) =>
    value == null ? null : DateTime.parse(value.toString()).toUtc();
