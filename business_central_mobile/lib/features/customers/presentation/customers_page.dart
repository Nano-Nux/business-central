import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'customers_controller.dart';

class CustomersPage extends ConsumerWidget {
  const CustomersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customers = ref.watch(customersControllerProvider);
    return customers.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Customers could not load: $error')),
      data: (items) => items.isEmpty
          ? const Center(child: Text('No named customers for this shop yet.'))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  '${items.length} customers',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text(
                  'View-only history derived from canonical sales and repair records.',
                ),
                const SizedBox(height: 16),
                for (final customer in items)
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.person_outline),
                      title: Text(customer.name),
                      subtitle: Text(
                        customer.phone.isEmpty
                            ? 'No phone recorded'
                            : customer.phone,
                      ),
                      trailing: Text(
                        '${customer.sales} sales · ${customer.repairs} repairs',
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
