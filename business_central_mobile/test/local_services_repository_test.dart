import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';
import 'package:business_central_mobile/features/services/data/local_services_repository.dart';

void main() {
  late AppDatabase database;
  late LocalOwnerSetupResult setup;
  late LocalServicesRepository services;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    setup = await LocalAuthService(database: database).provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    services = LocalServicesRepository(
      database: database,
      merchantId: setup.merchantId,
    );
  });

  tearDown(() => database.closeForTest());

  test('stores and updates the local service workflow', () async {
    final definition = await services.createDefinition(
      code: 'REPAIR',
      name: 'Device repair',
      laborFee: '25.00',
      description: 'Standard repair labor',
    );
    final updatedDefinition = await services.updateDefinition(
      id: definition.id,
      code: 'REPAIR-PRO',
      name: 'Priority device repair',
      laborFee: '40.00',
      durationMinutes: 90,
      isActive: true,
    );
    expect(updatedDefinition.name, 'Priority device repair');
    expect(updatedDefinition.laborFee, '40.00');
    expect(updatedDefinition.durationMinutes, 90);

    final order = await services.createOrder(
      shopId: setup.shopId,
      orderNumber: 'SR-1001',
      serviceType: 'REPAIR',
      priority: 'HIGH',
    );
    final item = await services.createItem(
      orderId: order.id,
      serviceId: definition.id,
      description: 'Replace charging port',
      quantity: '1',
      unitPrice: '55.00',
    );
    final appointment = await services.createAppointment(
      orderId: order.id,
      startsAt: DateTime.utc(2026, 8, 6, 9),
      endsAt: DateTime.utc(2026, 8, 6, 10),
      status: 'SCHEDULED',
    );
    final note = await services.createNote(
      orderId: order.id,
      note: 'Customer supplied the device PIN.',
    );
    final billing = await services.createBilling(
      orderId: order.id,
      amount: '55.00',
      status: 'PENDING',
    );
    await expectLater(
      services.createBilling(
        orderId: order.id,
        amount: '55.00',
        status: 'PENDING',
        promotionId: 'local-promotion-not-supported-here',
      ),
      throwsA(isA<FormatException>()),
    );

    final updatedOrder = await services.updateOrder(
      id: order.id,
      shopId: setup.shopId,
      orderNumber: 'SR-1001',
      serviceType: 'REPAIR',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    );
    final updatedItem = await services.updateItem(
      id: item.id,
      orderId: order.id,
      serviceId: definition.id,
      description: 'Replace charging port and test',
      quantity: '1',
      unitPrice: '60.00',
      status: 'IN_PROGRESS',
    );
    final updatedAppointment = await services.updateAppointment(
      id: appointment.id,
      orderId: order.id,
      startsAt: DateTime.utc(2026, 8, 6, 11),
      endsAt: DateTime.utc(2026, 8, 6, 12),
      status: 'CONFIRMED',
    );
    final updatedBilling = await services.updateBilling(
      id: billing.id,
      orderId: order.id,
      amount: '60.00',
      status: 'PAID_LOCALLY',
    );

    expect(updatedOrder.status, 'IN_PROGRESS');
    expect(updatedItem.description, contains('test'));
    expect(updatedAppointment.status, 'CONFIRMED');
    expect(updatedBilling.status, 'PAID_LOCALLY');
    expect((await services.listItems(orderId: order.id)), hasLength(1));
    expect((await services.listAppointments(orderId: order.id)), hasLength(1));
    expect((await services.listNotes(orderId: order.id)).single.id, note.id);
    expect(
      (await services.listBillings(orderId: order.id)).single.id,
      billing.id,
    );
  });

  test(
    'enforces merchant shop scope and cascades local order records',
    () async {
      expect(
        () => services.createOrder(
          shopId: 'another-merchant-shop',
          orderNumber: 'SR-1002',
          serviceType: 'REPAIR',
          priority: 'NORMAL',
        ),
        throwsA(isA<StateError>()),
      );

      final order = await services.createOrder(
        shopId: setup.shopId,
        orderNumber: 'SR-1003',
        serviceType: 'INSTALLATION',
        priority: 'NORMAL',
      );
      await services.createNote(orderId: order.id, note: 'Local note');
      await services.deleteOrder(id: order.id);

      expect(await services.listOrders(shopId: setup.shopId), isEmpty);
      expect(
        () => services.listNotes(orderId: order.id),
        throwsA(isA<StateError>()),
      );
    },
  );
}
