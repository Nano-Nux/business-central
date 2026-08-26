import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../pos/presentation/pos_controller.dart';
import '../domain/inventory_models.dart';
import 'inventory_controller.dart';

class InventoryPage extends ConsumerStatefulWidget {
  const InventoryPage({this.allowMutations = false, super.key});
  final bool allowMutations;

  @override
  ConsumerState<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends ConsumerState<InventoryPage> {
  String _variantId = '';
  String _locationId = '';
  String _quantity = '1';
  String _unitCost = '0';
  String _purchaseOrderId = '';
  String _purchaseOrderLineId = '';
  String _receiptNumber = '';
  String _batchNumber = '';
  String _expiresAt = '';

  @override
  Widget build(BuildContext context) {
    final inventory = ref.watch(inventoryControllerProvider);
    final catalog =
        ref.watch(posControllerProvider).asData?.value.catalog ?? const [];
    return inventory.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Inventory could not load: $error')),
      data: (locations) => locations.isEmpty
          ? const Center(child: Text('No active locations for this shop.'))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  'Stock locations',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Receive stock with exact quantity/cost and optional purchase-order, receipt, batch, and expiry context.',
                ),
                const SizedBox(height: 16),
                if (widget.allowMutations) ...[
                  Text(
                    'Receive stock',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  if (catalog.isEmpty)
                    const Text(
                      'No sellable variants are available for stock receiving.',
                    )
                  else ...[
                    DropdownButtonFormField<String>(
                      initialValue: _variantId.isEmpty ? null : _variantId,
                      decoration: const InputDecoration(labelText: 'Variant'),
                      items: [
                        for (final item in catalog)
                          DropdownMenuItem(
                            value: item.id,
                            child: Text('${item.name} · ${item.sku}'),
                          ),
                      ],
                      onChanged: (value) =>
                          setState(() => _variantId = value ?? ''),
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: _locationId.isEmpty ? null : _locationId,
                      decoration: const InputDecoration(
                        labelText: 'Destination location',
                      ),
                      items: [
                        for (final location in locations)
                          DropdownMenuItem(
                            value: location.id,
                            child: Text(location.name),
                          ),
                      ],
                      onChanged: (value) =>
                          setState(() => _locationId = value ?? ''),
                    ),
                    TextField(
                      decoration: const InputDecoration(labelText: 'Quantity'),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      onChanged: (value) => _quantity = value,
                    ),
                    TextField(
                      decoration: const InputDecoration(labelText: 'Unit cost'),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      onChanged: (value) => _unitCost = value,
                    ),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Purchase order ID (optional)',
                      ),
                      onChanged: (value) => _purchaseOrderId = value,
                    ),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Purchase order line ID (optional)',
                      ),
                      onChanged: (value) => _purchaseOrderLineId = value,
                    ),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Receipt number (optional)',
                      ),
                      onChanged: (value) => _receiptNumber = value,
                    ),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Batch number (optional)',
                      ),
                      onChanged: (value) => _batchNumber = value,
                    ),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Expiry timestamp (optional)',
                        hintText: '2026-12-31T00:00:00Z',
                      ),
                      onChanged: (value) => _expiresAt = value,
                    ),
                    FilledButton(
                      onPressed: _variantId.isEmpty || _locationId.isEmpty
                          ? null
                          : () async {
                              await ref
                                  .read(inventoryControllerProvider.notifier)
                                  .stockIn(
                                    variantId: _variantId,
                                    destinationLocationId: _locationId,
                                    quantity: _quantity,
                                    unitCost: _unitCost,
                                    purchaseOrderId: _purchaseOrderId,
                                    purchaseOrderLineId: _purchaseOrderLineId,
                                    receiptNumber: _receiptNumber,
                                    batchNumber: _batchNumber,
                                    expiresAt: _expiresAt,
                                  );
                            },
                      child: const Text('Receive stock'),
                    ),
                  ],
                  const Divider(height: 32),
                ],
                Text(
                  'Movement history',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                FutureBuilder<List<InventoryMovement>>(
                  future: ref
                      .read(inventoryControllerProvider.notifier)
                      .movements(),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const LinearProgressIndicator();
                    }
                    if (snapshot.hasError) {
                      return Text(
                        'Movement history could not load: ${snapshot.error}',
                      );
                    }
                    final movements =
                        snapshot.data ?? const <InventoryMovement>[];
                    if (movements.isEmpty) {
                      return const Card(
                        child: ListTile(
                          title: Text('No movements for this shop.'),
                        ),
                      );
                    }
                    return Column(
                      children: [
                        for (final movement in movements)
                          Card(
                            child: ListTile(
                              onTap: () =>
                                  _showMovementDetail(context, movement),
                              leading: const Icon(Icons.swap_vert),
                              title: Text(movement.movementType),
                              subtitle: Text(
                                'Variant ${movement.variantId}\nQuantity ${movement.quantity}',
                              ),
                              isThreeLine: true,
                              trailing: Text(movement.unitCost ?? '—'),
                            ),
                          ),
                      ],
                    );
                  },
                ),
                const SizedBox(height: 16),
                Text(
                  'Active locations',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                for (final location in locations)
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.warehouse_outlined),
                      title: Text(location.name),
                      subtitle: Text(
                        '${location.code} • ${location.locationType}',
                      ),
                      trailing: location.isActive
                          ? const Chip(label: Text('Active'))
                          : const Chip(label: Text('Inactive')),
                    ),
                  ),
              ],
            ),
    );
  }

  Future<void> _showMovementDetail(
    BuildContext context,
    InventoryMovement movement,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FutureBuilder<InventoryMovementDetail>(
            future: ref
                .read(inventoryControllerProvider.notifier)
                .movementDetail(id: movement.id),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SizedBox(
                  height: 160,
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snapshot.hasError) {
                return Text(
                  'Movement detail could not load: ${snapshot.error}',
                );
              }
              final detail = snapshot.data!;
              final item = detail.movement;
              return SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      detail.productName,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    Text('${detail.variantName} · ${detail.sku}'),
                    const SizedBox(height: 12),
                    Text('${item.movementType} · quantity ${item.quantity}'),
                    Text('Total cost ${detail.totalCost}'),
                    Text('Event ${item.eventKey}'),
                    if (detail.sourceLocationName != null)
                      Text(
                        'Source: ${detail.sourceLocationName} (${detail.sourceLocationCode ?? ''})',
                      ),
                    if (detail.destinationLocationName != null)
                      Text(
                        'Destination: ${detail.destinationLocationName} (${detail.destinationLocationCode ?? ''})',
                      ),
                    if (detail.sourceQuantityOnHand != null)
                      Text('Source on hand: ${detail.sourceQuantityOnHand}'),
                    if (detail.destinationQuantityOnHand != null)
                      Text(
                        'Destination on hand: ${detail.destinationQuantityOnHand}',
                      ),
                    if (detail.receipt != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Receipt ${detail.receipt!['receipt_number'] ?? ''}',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        'Supplier ${detail.receipt!['supplier_name'] ?? ''} · Unit cost ${detail.receipt!['unit_cost'] ?? ''}',
                      ),
                    ],
                    if (detail.order != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Order ${detail.order!['order_number'] ?? ''}',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        '${detail.order!['channel'] ?? ''} · ${detail.order!['status'] ?? ''}',
                      ),
                    ],
                    const SizedBox(height: 12),
                    Text(
                      'FIFO cost allocations',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (detail.costAllocations.isEmpty)
                      const Text('No FIFO allocations recorded.')
                    else
                      for (final allocation in detail.costAllocations)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            '${allocation.quantity} × ${allocation.unitCost}',
                          ),
                          subtitle: Text(
                            'Total ${allocation.totalCost} · Remaining ${allocation.layerQuantityRemaining}',
                          ),
                          trailing: Text(allocation.sourceReceiptNumber ?? ''),
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
}
