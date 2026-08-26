import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../app/providers.dart';
import '../../promotions/domain/promotion_models.dart';
import '../../deliveries/presentation/deliveries_controller.dart';
import '../../promotions/presentation/promotions_controller.dart';
import 'pos_controller.dart';
import '../domain/pos_models.dart';

class PosPage extends ConsumerStatefulWidget {
  const PosPage({this.allowMutations = false, super.key});
  final bool allowMutations;
  @override
  ConsumerState<PosPage> createState() => _PosPageState();
}

class _PosPageState extends ConsumerState<PosPage> {
  String _query = '';
  String _paymentMethod = 'CASH';
  String _customerName = '';
  String _customerPhone = '';
  String _note = '';
  String _deliveryId = '';
  String _promotionId = '';

  Future<void> _lookup(String value) async {
    final barcode = value.trim();
    if (barcode.isEmpty) return;
    try {
      final matches = await ref
          .read(posControllerProvider.notifier)
          .lookupBarcode(barcode);
      if (!mounted) return;
      setState(() => _query = '');
      if (matches.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No product or stock found for barcode.'),
          ),
        );
      } else if (matches.length > 1) {
        final selected = await showDialog<PosCatalogItem>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Choose a matching variant'),
            content: SizedBox(
              width: 420,
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final item in matches)
                    ListTile(
                      title: Text(item.name),
                      subtitle: Text('${item.productName ?? ''} · ${item.sku}'),
                      onTap: () => Navigator.of(dialogContext).pop(item),
                    ),
                ],
              ),
            ),
          ),
        );
        if (selected != null && mounted) {
          ref.read(posControllerProvider.notifier).add(selected);
        }
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Barcode lookup failed: $error')));
    }
  }

  Future<void> _scanBarcode({required String title}) async {
    final value = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => SizedBox(
        height: MediaQuery.sizeOf(context).height * .65,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            Expanded(
              child: MobileScanner(
                onDetect: (capture) {
                  final code = capture.barcodes
                      .map((barcode) => barcode.rawValue)
                      .whereType<String>()
                      .firstOrNull;
                  if (code != null && code.isNotEmpty && mounted) {
                    Navigator.of(context).pop(code);
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
    if (value != null) await _lookup(value);
  }

  @override
  Widget build(BuildContext context) {
    final pos = ref.watch(posControllerProvider);
    final fullyOffline = ref.watch(configurationProvider).isFullyOffline;
    final deliveries =
        ref.watch(deliveriesControllerProvider).asData?.value ?? const [];
    final promotions =
        ref.watch(promotionsControllerProvider).asData?.value ??
        const <PromotionRecord>[];
    return pos.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('POS could not load: $error')),
      data: (state) {
        final visible = state.catalog
            .where(
              (item) => '${item.name} ${item.sku} ${item.barcode ?? ''}'
                  .toLowerCase()
                  .contains(_query.toLowerCase()),
            )
            .toList();
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: TextField(
                onChanged: (value) => setState(() => _query = value),
                onSubmitted: _lookup,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  labelText: 'Search products, SKU or barcode',
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => _scanBarcode(title: 'Scan barcode'),
                      icon: const Icon(Icons.qr_code_scanner),
                      label: const Text('Scan'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () =>
                          _scanBarcode(title: 'Camera barcode scan'),
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: const Text('Camera'),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: visible.length,
                itemBuilder: (context, index) {
                  final item = visible[index];
                  return ListTile(
                    title: Text(item.name),
                    subtitle: Text('${item.productName ?? ''} • ${item.sku}'),
                    trailing: IconButton(
                      icon: const Icon(Icons.add_shopping_cart_outlined),
                      onPressed: () =>
                          ref.read(posControllerProvider.notifier).add(item),
                    ),
                  );
                },
              ),
            ),
            if (state.cart.isNotEmpty)
              Card(
                margin: const EdgeInsets.all(12),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Cart: ${state.cart.fold<int>(0, (total, line) => total + line.quantity)} items',
                      ),
                      for (final line in state.cart)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(line.item.name),
                          subtitle: Text('Quantity: ${line.quantity}'),
                          trailing: Wrap(
                            spacing: 4,
                            children: [
                              IconButton(
                                tooltip: 'Remove one',
                                icon: const Icon(Icons.remove_circle_outline),
                                onPressed: () => ref
                                    .read(posControllerProvider.notifier)
                                    .remove(line.item),
                              ),
                              IconButton(
                                tooltip: 'Add one',
                                icon: const Icon(Icons.add_circle_outline),
                                onPressed: () => ref
                                    .read(posControllerProvider.notifier)
                                    .add(line.item),
                              ),
                            ],
                          ),
                        ),
                      TextField(
                        decoration: const InputDecoration(
                          labelText: 'Customer name (optional)',
                        ),
                        onChanged: (value) => _customerName = value,
                      ),
                      TextField(
                        decoration: const InputDecoration(
                          labelText: 'Customer phone (optional)',
                        ),
                        keyboardType: TextInputType.phone,
                        onChanged: (value) => _customerPhone = value,
                      ),
                      TextField(
                        decoration: const InputDecoration(
                          labelText: 'Note (optional)',
                        ),
                        onChanged: (value) => _note = value,
                      ),
                      if (deliveries.isNotEmpty)
                        DropdownButtonFormField<String>(
                          initialValue: _deliveryId.isEmpty
                              ? null
                              : _deliveryId,
                          decoration: const InputDecoration(
                            labelText: 'Delivery option (optional)',
                          ),
                          items: [
                            const DropdownMenuItem<String>(
                              value: '',
                              child: Text('No delivery'),
                            ),
                            for (final delivery in deliveries)
                              DropdownMenuItem(
                                value: delivery.id,
                                child: Text(delivery.name),
                              ),
                          ],
                          onChanged: (value) {
                            setState(() => _deliveryId = value ?? '');
                            ref
                                .read(posControllerProvider.notifier)
                                .clearQuote();
                          },
                        ),
                      if (promotions.isNotEmpty)
                        DropdownButtonFormField<String>(
                          initialValue: _promotionId.isEmpty
                              ? null
                              : _promotionId,
                          decoration: const InputDecoration(
                            labelText: 'Promotion (optional)',
                          ),
                          items: [
                            const DropdownMenuItem<String>(
                              value: '',
                              child: Text('No promotion'),
                            ),
                            for (final promotion in promotions)
                              DropdownMenuItem(
                                value: promotion.id,
                                child: Text(promotion.name),
                              ),
                          ],
                          onChanged: (value) {
                            setState(() => _promotionId = value ?? '');
                            ref
                                .read(posControllerProvider.notifier)
                                .clearQuote();
                          },
                        ),
                      DropdownButtonFormField<String>(
                        initialValue: _paymentMethod,
                        decoration: const InputDecoration(
                          labelText: 'Payment method',
                        ),
                        items: const [
                          DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                          DropdownMenuItem(value: 'CARD', child: Text('Card')),
                          DropdownMenuItem(value: 'QR', child: Text('QR')),
                          DropdownMenuItem(
                            value: 'BANK_TRANSFER',
                            child: Text('Bank transfer'),
                          ),
                        ],
                        onChanged: (value) {
                          if (value != null) {
                            setState(() => _paymentMethod = value);
                          }
                        },
                      ),
                      if (state.quote != null)
                        Text(
                          fullyOffline
                              ? 'Local total: ${state.quote!.grandTotal} ${state.quote!.currencyCode}'
                              : 'Authoritative total: ${state.quote!.grandTotal} ${state.quote!.currencyCode}',
                        ),
                      if (widget.allowMutations)
                        FilledButton(
                          onPressed: () => ref
                              .read(posControllerProvider.notifier)
                              .requestQuote(
                                deliveryId: _deliveryId.isEmpty
                                    ? null
                                    : _deliveryId,
                                promotionId: _promotionId.isEmpty
                                    ? null
                                    : _promotionId,
                              ),
                          child: Text(
                            fullyOffline
                                ? 'Calculate local total'
                                : 'Get authoritative quote',
                          ),
                        ),
                      if (widget.allowMutations && state.quote != null)
                        OutlinedButton(
                          onPressed: () async {
                            try {
                              final result = await ref
                                  .read(posControllerProvider.notifier)
                                  .checkout(
                                    paymentMethod: _paymentMethod,
                                    deliveryId: _deliveryId.isEmpty
                                        ? null
                                        : _deliveryId,
                                    promotionId: _promotionId.isEmpty
                                        ? null
                                        : _promotionId,
                                    customerName: _customerName,
                                    customerPhone: _customerPhone,
                                    note: _note,
                                  );
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    'Sale completed${result.number == null ? '' : ' · ${result.number}'}',
                                  ),
                                ),
                              );
                            } catch (error) {
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('Checkout failed: $error'),
                                ),
                              );
                            }
                          },
                          child: const Text('Complete checkout'),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
