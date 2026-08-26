import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../domain/service_models.dart';
import 'services_controller.dart';

class ServicesPage extends ConsumerStatefulWidget {
  const ServicesPage({super.key, this.allowMutations = false});

  final bool allowMutations;

  @override
  ConsumerState<ServicesPage> createState() => _ServicesPageState();
}

class _ServicesPageState extends ConsumerState<ServicesPage> {
  @override
  Widget build(BuildContext context) {
    final catalog = ref.watch(servicesCatalogProvider);
    final orders = ref.watch(serviceOrdersProvider);
    final fullyOffline = ref.watch(configurationProvider).isFullyOffline;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Services', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(
          fullyOffline
              ? 'Local service catalog and shop-scoped service orders. Billing records do not capture external payments.'
              : 'Service catalog and shop-scoped service orders are backend-authoritative.',
        ),
        const SizedBox(height: 16),
        _sectionTitle(context, 'Service catalog'),
        if (widget.allowMutations)
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.tonal(
              onPressed: _createDefinition,
              child: const Text('New service'),
            ),
          ),
        catalog.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) => Text('Service catalog could not load: $error'),
          data: (items) => items.isEmpty
              ? const Text('No service definitions configured.')
              : Column(
                  children: [
                    for (final item in items)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${item.code} · ${item.name}'),
                        subtitle: Text(
                          '${item.laborFee} · ${item.isActive ? 'Active' : 'Inactive'}',
                        ),
                        trailing: widget.allowMutations
                            ? Wrap(
                                children: [
                                  IconButton(
                                    tooltip: 'Edit service',
                                    onPressed: () => _editDefinition(item),
                                    icon: const Icon(Icons.edit_outlined),
                                  ),
                                  IconButton(
                                    tooltip: 'Delete service',
                                    onPressed: () => _deleteDefinition(item),
                                    icon: const Icon(Icons.delete_outline),
                                  ),
                                ],
                              )
                            : null,
                      ),
                  ],
                ),
        ),
        const Divider(height: 32),
        _sectionTitle(context, 'Service orders'),
        if (widget.allowMutations)
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.tonal(
              onPressed: () => _createOrder(context),
              child: const Text('New service order'),
            ),
          ),
        orders.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) => Text('Service orders could not load: $error'),
          data: (items) => items.isEmpty
              ? const Text('No service orders for this shop.')
              : Column(
                  children: [
                    for (final item in items)
                      Card(
                        child: ListTile(
                          onTap: () => _showOrderDetails(item),
                          title: Text(item.orderNumber),
                          subtitle: Text(
                            '${item.serviceType} · ${item.priority}',
                          ),
                          trailing: widget.allowMutations
                              ? Wrap(
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    Text(item.status),
                                    IconButton(
                                      tooltip: 'Edit service order',
                                      onPressed: () => _editOrder(item),
                                      icon: const Icon(Icons.edit_outlined),
                                    ),
                                    IconButton(
                                      tooltip: 'Delete service order',
                                      onPressed: () => _deleteOrder(item),
                                      icon: const Icon(Icons.delete_outline),
                                    ),
                                  ],
                                )
                              : Text(item.status),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  Widget _sectionTitle(BuildContext context, String title) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(title, style: Theme.of(context).textTheme.titleLarge),
  );

  Future<void> _createDefinition() async {
    final values = await _form(
      context,
      title: 'New service',
      fields: const [
        ('code', 'Code'),
        ('name', 'Name'),
        ('labor_fee', 'Labor fee'),
        ('description', 'Description'),
      ],
    );
    if (values == null ||
        values['code']!.trim().isEmpty ||
        values['name']!.trim().isEmpty ||
        values['labor_fee']!.trim().isEmpty) {
      return;
    }
    try {
      await ref
          .read(servicesCatalogProvider.notifier)
          .createDefinition(
            code: values['code']!,
            name: values['name']!,
            laborFee: values['labor_fee']!,
            description: values['description'],
          );
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _deleteDefinition(ServiceDefinition item) async {
    try {
      await ref
          .read(servicesCatalogProvider.notifier)
          .deleteDefinition(id: item.id);
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _editDefinition(ServiceDefinition item) async {
    final values = await _form(
      context,
      title: 'Edit service',
      fields: const [
        ('code', 'Code'),
        ('name', 'Name'),
        ('labor_fee', 'Labor fee'),
        ('description', 'Description'),
        ('duration_minutes', 'Duration in minutes'),
      ],
      initialValues: {
        'code': item.code,
        'name': item.name,
        'labor_fee': item.laborFee,
        'description': item.description ?? '',
        'duration_minutes': item.durationMinutes?.toString() ?? '',
      },
    );
    if (values == null ||
        values['code']!.trim().isEmpty ||
        values['name']!.trim().isEmpty ||
        values['labor_fee']!.trim().isEmpty) {
      return;
    }
    try {
      await ref
          .read(servicesCatalogProvider.notifier)
          .updateDefinition(
            id: item.id,
            code: values['code']!,
            name: values['name']!,
            laborFee: values['labor_fee']!,
            description: values['description'],
            durationMinutes: int.tryParse(values['duration_minutes']!.trim()),
            isActive: item.isActive,
          );
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _editOrder(ServiceOrder item) async {
    final values = await _form(
      context,
      title: 'Edit service order',
      fields: const [
        ('order_number', 'Order number'),
        ('service_type', 'Service type'),
        ('status', 'Status'),
        ('priority', 'Priority'),
      ],
      initialValues: {
        'order_number': item.orderNumber,
        'service_type': item.serviceType,
        'status': item.status,
        'priority': item.priority,
      },
    );
    if (values == null ||
        values['order_number']!.trim().isEmpty ||
        values['service_type']!.trim().isEmpty) {
      return;
    }
    try {
      await ref
          .read(serviceOrdersProvider.notifier)
          .updateOrder(
            id: item.id,
            orderNumber: values['order_number']!,
            serviceType: values['service_type']!,
            status: values['status']!.trim().isEmpty
                ? item.status
                : values['status']!,
            priority: values['priority']!.trim().isEmpty
                ? item.priority
                : values['priority']!,
          );
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _deleteOrder(ServiceOrder item) async {
    try {
      await ref.read(serviceOrdersProvider.notifier).deleteOrder(id: item.id);
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _createOrder(BuildContext context) async {
    final values = await _form(
      context,
      title: 'New service order',
      fields: const [
        ('service_type', 'Service type'),
        ('priority', 'Priority'),
      ],
    );
    if (values == null || values['service_type']!.trim().isEmpty) return;
    try {
      await ref
          .read(serviceOrdersProvider.notifier)
          .createOrder(
            orderNumber: 'SVC-${DateTime.now().millisecondsSinceEpoch}',
            serviceType: values['service_type']!,
            priority: values['priority']!.trim().isEmpty
                ? 'NORMAL'
                : values['priority']!,
          );
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _showOrderDetails(ServiceOrder order) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FutureBuilder<List<ServiceOrderItem>>(
            future: ref.read(serviceOrdersProvider.notifier).items(order.id),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SizedBox(
                  height: 160,
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snapshot.hasError) {
                return Text('Service items could not load: ${snapshot.error}');
              }
              final items = snapshot.data ?? const <ServiceOrderItem>[];
              return SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.orderNumber,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    Text('${order.serviceType} · ${order.status}'),
                    const SizedBox(height: 12),
                    if (items.isEmpty)
                      const Text('No service items recorded.')
                    else
                      for (final item in items)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(item.description),
                          subtitle: Text(
                            '${item.quantity} × ${item.unitPrice} · ${item.status}',
                          ),
                        ),
                    const SizedBox(height: 12),
                    _detailSection<ServiceAppointment>(
                      context,
                      title: 'Appointments',
                      future: ref
                          .read(serviceOrdersProvider.notifier)
                          .appointments(order.id),
                      emptyText: 'No appointments recorded.',
                      itemBuilder: (appointment) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(appointment.status),
                        subtitle: Text(
                          '${appointment.startsAt.toIso8601String()} → ${appointment.endsAt.toIso8601String()}',
                        ),
                      ),
                    ),
                    _detailSection<ServiceNote>(
                      context,
                      title: 'Notes',
                      future: ref
                          .read(serviceOrdersProvider.notifier)
                          .notes(order.id),
                      emptyText: 'No notes recorded.',
                      itemBuilder: (note) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(note.note),
                        subtitle: Text(note.createdAt.toIso8601String()),
                      ),
                    ),
                    _detailSection<ServiceBilling>(
                      context,
                      title: 'Billing',
                      future: ref
                          .read(serviceOrdersProvider.notifier)
                          .billings(order.id),
                      emptyText: 'No billing records.',
                      itemBuilder: (billing) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(billing.amount),
                        trailing: Text(billing.status),
                      ),
                    ),
                    if (widget.allowMutations)
                      Wrap(
                        spacing: 8,
                        children: [
                          OutlinedButton(
                            onPressed: () => _addAppointment(order, context),
                            child: const Text('Schedule'),
                          ),
                          OutlinedButton(
                            onPressed: () => _addNote(order, context),
                            child: const Text('Add note'),
                          ),
                          OutlinedButton(
                            onPressed: () => _addBilling(order, context),
                            child: const Text('Record billing'),
                          ),
                        ],
                      ),
                    if (widget.allowMutations)
                      FilledButton.tonal(
                        onPressed: () async {
                          final values = await _form(
                            context,
                            title: 'Add service item',
                            fields: const [
                              ('service_id', 'Service ID'),
                              ('description', 'Description'),
                              ('quantity', 'Quantity'),
                              ('unit_price', 'Unit price'),
                            ],
                          );
                          if (values == null ||
                              values['service_id']!.trim().isEmpty ||
                              values['description']!.trim().isEmpty) {
                            return;
                          }
                          try {
                            await ref
                                .read(serviceOrdersProvider.notifier)
                                .addItem(
                                  orderId: order.id,
                                  serviceId: values['service_id']!,
                                  description: values['description']!,
                                  quantity: values['quantity']!.trim().isEmpty
                                      ? '1'
                                      : values['quantity']!,
                                  unitPrice:
                                      values['unit_price']!.trim().isEmpty
                                      ? '0'
                                      : values['unit_price']!,
                                );
                            if (context.mounted) Navigator.pop(context);
                          } catch (error) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(
                                context,
                              ).showSnackBar(SnackBar(content: Text('$error')));
                            }
                          }
                        },
                        child: const Text('Add item'),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _detailSection<T>(
    BuildContext context, {
    required String title,
    required Future<List<T>> future,
    required String emptyText,
    required Widget Function(T item) itemBuilder,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        FutureBuilder<List<T>>(
          future: future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const LinearProgressIndicator();
            }
            if (snapshot.hasError) {
              return Text('Could not load $title: ${snapshot.error}');
            }
            final items = snapshot.data ?? <T>[];
            return items.isEmpty
                ? Text(emptyText)
                : Column(
                    children: [for (final item in items) itemBuilder(item)],
                  );
          },
        ),
      ],
    );
  }

  Future<void> _addAppointment(
    ServiceOrder order,
    BuildContext sheetContext,
  ) async {
    final values = await _form(
      context,
      title: 'Schedule appointment',
      fields: const [
        ('starts_at', 'Starts at (ISO UTC)'),
        ('ends_at', 'Ends at (ISO UTC)'),
        ('status', 'Status'),
      ],
    );
    if (values == null) return;
    final startsAt = DateTime.tryParse(values['starts_at']!.trim());
    final endsAt = DateTime.tryParse(values['ends_at']!.trim());
    if (startsAt == null || endsAt == null) return;
    try {
      await ref
          .read(serviceOrdersProvider.notifier)
          .addAppointment(
            orderId: order.id,
            startsAt: startsAt,
            endsAt: endsAt,
            status: values['status']!.trim().isEmpty
                ? 'SCHEDULED'
                : values['status']!,
          );
      if (sheetContext.mounted) Navigator.pop(sheetContext);
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _addNote(ServiceOrder order, BuildContext sheetContext) async {
    final values = await _form(
      context,
      title: 'Add service note',
      fields: const [('note', 'Note')],
    );
    if (values == null || values['note']!.trim().isEmpty) return;
    try {
      await ref
          .read(serviceOrdersProvider.notifier)
          .addNote(orderId: order.id, note: values['note']!);
      if (sheetContext.mounted) Navigator.pop(sheetContext);
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _addBilling(
    ServiceOrder order,
    BuildContext sheetContext,
  ) async {
    final values = await _form(
      context,
      title: 'Record service billing',
      fields: const [('amount', 'Amount'), ('status', 'Status')],
    );
    if (values == null || values['amount']!.trim().isEmpty) return;
    try {
      await ref
          .read(serviceOrdersProvider.notifier)
          .addBilling(
            orderId: order.id,
            amount: values['amount']!,
            status: values['status']!.trim().isEmpty
                ? 'PENDING'
                : values['status']!,
          );
      if (sheetContext.mounted) Navigator.pop(sheetContext);
    } catch (error) {
      _showError('$error');
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<Map<String, String>?> _form(
    BuildContext context, {
    required String title,
    required List<(String, String)> fields,
    Map<String, String> initialValues = const {},
  }) {
    return showDialog<Map<String, String>>(
      context: context,
      builder: (context) {
        final controllers = {
          for (final field in fields)
            field.$1: TextEditingController(text: initialValues[field.$1]),
        };
        return AlertDialog(
          title: Text(title),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final field in fields)
                  TextField(
                    controller: controllers[field.$1],
                    decoration: InputDecoration(labelText: field.$2),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, {
                for (final field in fields)
                  field.$1: controllers[field.$1]!.text,
              }),
              child: const Text('Save'),
            ),
          ],
        );
      },
    );
  }
}
