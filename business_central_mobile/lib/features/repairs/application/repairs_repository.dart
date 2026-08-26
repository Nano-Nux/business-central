import '../domain/repair_models.dart';

abstract interface class RepairsRepository {
  Future<List<RepairRecord>> list({required String shopId});
  Future<List<RepairFormField>> listFormDefinitions({required String shopId});
  Future<List<RepairWorkItem>> listWorkItems({required String repairOrderId});
  Future<RepairWorkItem> updateWorkItem({
    required String repairOrderId,
    required String workItemId,
    required String status,
  });

  Future<List<RepairDiagnostic>> listDiagnostics({
    required String repairOrderId,
  });

  Future<RepairDiagnostic> createDiagnostic({
    required String repairOrderId,
    required String diagnosis,
    String? estimatedCost,
    String? workItemId,
  });

  Future<List<RepairPayment>> listPayments({required String repairOrderId});

  Future<RepairPayment> createPayment({
    required String repairOrderId,
    required String kind,
    required String method,
    required String amount,
  });

  Future<List<RepairRefund>> listRefunds({required String repairOrderId});
  Future<RepairRefund> createRefund({
    required String repairOrderId,
    required String paymentId,
    required String amount,
    String? reason,
    String? idempotencyKey,
  });

  Future<List<RepairImage>> listImages({required String repairOrderId});
  Future<RepairImage> createImage({
    required String repairOrderId,
    required String filename,
    required String contentType,
    required String dataBase64,
    String? workItemId,
  });
  Future<void> deleteImage(String id);

  Future<List<RepairPart>> listParts({required String repairOrderId});
  Future<RepairPart> createPart({
    required String repairOrderId,
    String? variantId,
    String? customerSuppliedPartId,
    required String quantity,
    required String unitPrice,
    String status,
    String? promotionId,
    String? workItemId,
  });
  Future<RepairPart> updatePart({
    required String id,
    String? variantId,
    String? customerSuppliedPartId,
    required String quantity,
    required String unitPrice,
    required String status,
    String? promotionId,
  });
  Future<void> deletePart(String id);

  Future<List<RepairApproval>> listApprovals({required String repairOrderId});
  Future<RepairApproval> createApproval({
    required String repairOrderId,
    required int approvalVersion,
    required String status,
    String? approvedAmount,
    DateTime? approvedAt,
    String? workItemId,
  });
  Future<RepairApproval> updateApproval({
    required String id,
    required String repairOrderId,
    required int approvalVersion,
    required String status,
    String? approvedAmount,
    DateTime? approvedAt,
  });
  Future<void> deleteApproval(String id);

  Future<List<RepairWarranty>> listWarranties({required String repairOrderId});
  Future<RepairWarranty> createWarranty({
    required String repairOrderId,
    required DateTime startsAt,
    required DateTime endsAt,
    String? terms,
    String? workItemId,
  });
  Future<RepairWarranty> updateWarranty({
    required String id,
    required String repairOrderId,
    required DateTime startsAt,
    required DateTime endsAt,
    String? terms,
  });
  Future<void> deleteWarranty(String id);

  Future<void> updateStatus({
    required RepairRecord repair,
    required String status,
  });

  Future<RepairTicketResult> createTicket({
    required String shopId,
    required String orderNumber,
    required String deviceType,
    required String issueDescription,
    String? manufacturer,
    String? model,
    String? serialNumber,
    String? priority,
    String? customerName,
    String? customerPhone,
    String? additionalFee,
    String? note,
    List<RepairWorkItemInput>? workItems,
    Map<String, Object?>? ticketFields,
  });
}
