import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'deliveries_controller.dart';

class DeliveriesPage extends ConsumerStatefulWidget {
  const DeliveriesPage({super.key});

  @override
  ConsumerState<DeliveriesPage> createState() => _DeliveriesPageState();
}

class _DeliveriesPageState extends ConsumerState<DeliveriesPage> {
  final _nameController = TextEditingController();
  final _contactController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _contactController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final deliveries = ref.watch(deliveriesControllerProvider);
    return deliveries.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Deliveries could not load: $error')),
      data: (items) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Delivery options',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          const Text(
            'Manage delivery choices available during POS checkout for this shop.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: 'Delivery name'),
          ),
          TextField(
            controller: _contactController,
            decoration: const InputDecoration(labelText: 'Contact information'),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () async {
              if (_nameController.text.trim().isEmpty ||
                  _contactController.text.trim().isEmpty) {
                return;
              }
              await ref
                  .read(deliveriesControllerProvider.notifier)
                  .create(
                    name: _nameController.text,
                    contactInfo: _contactController.text,
                  );
              if (!mounted) return;
              _nameController.clear();
              _contactController.clear();
            },
            child: const Text('Add delivery option'),
          ),
          const SizedBox(height: 16),
          if (items.isEmpty)
            const Card(
              child: ListTile(title: Text('No delivery options configured.')),
            )
          else
            for (final item in items)
              Card(
                child: ListTile(
                  title: Text(item.name),
                  subtitle: Text(item.contactInfo),
                  trailing: IconButton(
                    tooltip: 'Remove delivery option',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => ref
                        .read(deliveriesControllerProvider.notifier)
                        .remove(item.id),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
