import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/services_repository.dart';
import '../data/local_services_repository.dart';
import '../data/online_services_repository.dart';
import '../domain/service_models.dart';

final servicesRepositoryProvider = Provider<ServicesRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalServicesRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
    );
  }
  return OnlineServicesRepository(ref.watch(onlineAuthApiProvider));
});

final servicesCatalogProvider =
    AsyncNotifierProvider<ServicesCatalogController, List<ServiceDefinition>>(
      ServicesCatalogController.new,
    );

class ServicesCatalogController extends AsyncNotifier<List<ServiceDefinition>> {
  @override
  Future<List<ServiceDefinition>> build() {
    return ref.read(servicesRepositoryProvider).listCatalog();
  }

  Future<void> createDefinition({
    required String code,
    required String name,
    required String laborFee,
    String? description,
  }) async {
    await ref
        .read(servicesRepositoryProvider)
        .createDefinition(
          code: code,
          name: name,
          laborFee: laborFee,
          description: description,
        );
    state = await AsyncValue.guard(
      () => ref.read(servicesRepositoryProvider).listCatalog(),
    );
  }

  Future<void> deleteDefinition({required String id}) async {
    await ref.read(servicesRepositoryProvider).deleteDefinition(id: id);
    state = await AsyncValue.guard(
      () => ref.read(servicesRepositoryProvider).listCatalog(),
    );
  }

  Future<void> updateDefinition({
    required String id,
    required String code,
    required String name,
    required String laborFee,
    String? description,
    int? durationMinutes,
    bool? isActive,
  }) async {
    await ref
        .read(servicesRepositoryProvider)
        .updateDefinition(
          id: id,
          code: code,
          name: name,
          laborFee: laborFee,
          description: description,
          durationMinutes: durationMinutes,
          isActive: isActive,
        );
    state = await AsyncValue.guard(
      () => ref.read(servicesRepositoryProvider).listCatalog(),
    );
  }
}

final serviceOrdersProvider =
    AsyncNotifierProvider<ServiceOrdersController, List<ServiceOrder>>(
      ServiceOrdersController.new,
    );

class ServiceOrdersController extends AsyncNotifier<List<ServiceOrder>> {
  @override
  Future<List<ServiceOrder>> build() => _load();

  Future<List<ServiceOrder>> _load() async {
    final shopId = _shopId();
    return ref.read(servicesRepositoryProvider).listOrders(shopId: shopId);
  }

  Future<void> createOrder({
    required String orderNumber,
    required String serviceType,
    required String priority,
  }) async {
    await ref
        .read(servicesRepositoryProvider)
        .createOrder(
          shopId: _shopId(),
          orderNumber: orderNumber,
          serviceType: serviceType,
          priority: priority,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> updateOrder({
    required String id,
    required String orderNumber,
    required String serviceType,
    required String status,
    required String priority,
  }) async {
    await ref
        .read(servicesRepositoryProvider)
        .updateOrder(
          id: id,
          shopId: _shopId(),
          orderNumber: orderNumber,
          serviceType: serviceType,
          status: status,
          priority: priority,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> deleteOrder({required String id}) async {
    await ref.read(servicesRepositoryProvider).deleteOrder(id: id);
    state = await AsyncValue.guard(_load);
  }

  Future<List<ServiceOrderItem>> items(String orderId) {
    return ref.read(servicesRepositoryProvider).listItems(orderId: orderId);
  }

  Future<ServiceOrderItem> addItem({
    required String orderId,
    required String serviceId,
    required String description,
    required String quantity,
    required String unitPrice,
  }) {
    return ref
        .read(servicesRepositoryProvider)
        .createItem(
          orderId: orderId,
          serviceId: serviceId,
          description: description,
          quantity: quantity,
          unitPrice: unitPrice,
        );
  }

  Future<ServiceOrderItem> updateItem({
    required String id,
    required String orderId,
    required String serviceId,
    required String description,
    required String quantity,
    required String unitPrice,
    required String status,
  }) => ref
      .read(servicesRepositoryProvider)
      .updateItem(
        id: id,
        orderId: orderId,
        serviceId: serviceId,
        description: description,
        quantity: quantity,
        unitPrice: unitPrice,
        status: status,
      );

  Future<void> deleteItem({required String id}) =>
      ref.read(servicesRepositoryProvider).deleteItem(id: id);

  Future<List<ServiceAppointment>> appointments(String orderId) {
    return ref
        .read(servicesRepositoryProvider)
        .listAppointments(orderId: orderId);
  }

  Future<ServiceAppointment> addAppointment({
    required String orderId,
    required DateTime startsAt,
    required DateTime endsAt,
    required String status,
  }) {
    return ref
        .read(servicesRepositoryProvider)
        .createAppointment(
          orderId: orderId,
          startsAt: startsAt,
          endsAt: endsAt,
          status: status,
        );
  }

  Future<ServiceAppointment> updateAppointment({
    required String id,
    required String orderId,
    required DateTime startsAt,
    required DateTime endsAt,
    required String status,
  }) => ref
      .read(servicesRepositoryProvider)
      .updateAppointment(
        id: id,
        orderId: orderId,
        startsAt: startsAt,
        endsAt: endsAt,
        status: status,
      );

  Future<void> deleteAppointment({required String id}) =>
      ref.read(servicesRepositoryProvider).deleteAppointment(id: id);

  Future<List<ServiceNote>> notes(String orderId) {
    return ref.read(servicesRepositoryProvider).listNotes(orderId: orderId);
  }

  Future<ServiceNote> addNote({required String orderId, required String note}) {
    return ref
        .read(servicesRepositoryProvider)
        .createNote(orderId: orderId, note: note);
  }

  Future<void> deleteNote({required String id}) =>
      ref.read(servicesRepositoryProvider).deleteNote(id: id);

  Future<List<ServiceBilling>> billings(String orderId) {
    return ref.read(servicesRepositoryProvider).listBillings(orderId: orderId);
  }

  Future<ServiceBilling> addBilling({
    required String orderId,
    required String amount,
    required String status,
    String? promotionId,
  }) {
    return ref
        .read(servicesRepositoryProvider)
        .createBilling(
          orderId: orderId,
          amount: amount,
          status: status,
          promotionId: promotionId,
        );
  }

  Future<ServiceBilling> updateBilling({
    required String id,
    required String orderId,
    required String amount,
    required String status,
    String? promotionId,
  }) => ref
      .read(servicesRepositoryProvider)
      .updateBilling(
        id: id,
        orderId: orderId,
        amount: amount,
        status: status,
        promotionId: promotionId,
      );

  Future<void> deleteBilling({required String id}) =>
      ref.read(servicesRepositoryProvider).deleteBilling(id: id);

  String _shopId() {
    if (ref.read(configurationProvider).isFullyOffline) {
      final shopId = ref.read(localAuthControllerProvider).asData?.value.shopId;
      if (shopId == null) throw StateError('Local workspace is not ready.');
      return shopId;
    }
    final shopId = ref
        .read(onlineWorkspaceControllerProvider)
        .asData
        ?.value
        ?.selectedShop
        .id;
    if (shopId == null) throw StateError('Workspace is not ready.');
    return shopId;
  }
}
