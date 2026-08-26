import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/promotions_repository.dart';
import '../domain/promotion_models.dart';
import 'promotions_controller.dart';

class PromotionsPage extends ConsumerStatefulWidget {
  const PromotionsPage({super.key});

  @override
  ConsumerState<PromotionsPage> createState() => _PromotionsPageState();
}

class _PromotionsPageState extends ConsumerState<PromotionsPage> {
  final _name = TextEditingController();
  final _value = TextEditingController();
  final _minimumSubtotal = TextEditingController();
  final _usageLimit = TextEditingController();
  final _startsAt = TextEditingController();
  final _endsAt = TextEditingController();
  String _type = 'PERCENTAGE';

  @override
  void dispose() {
    _name.dispose();
    _value.dispose();
    _minimumSubtotal.dispose();
    _usageLimit.dispose();
    _startsAt.dispose();
    _endsAt.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final promotions = ref.watch(promotionsControllerProvider);
    return promotions.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Promotions could not load: $error')),
      data: (items) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Promotions', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          const Text(
            'The backend remains authoritative for eligibility, schedules, scopes, and discounts.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Promotion name'),
          ),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Type'),
            items: const [
              DropdownMenuItem(value: 'PERCENTAGE', child: Text('Percentage')),
              DropdownMenuItem(
                value: 'FIXED_AMOUNT',
                child: Text('Fixed amount'),
              ),
            ],
            onChanged: (value) => setState(() => _type = value ?? 'PERCENTAGE'),
          ),
          TextField(
            controller: _value,
            decoration: const InputDecoration(labelText: 'Value'),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          TextField(
            controller: _minimumSubtotal,
            decoration: const InputDecoration(
              labelText: 'Minimum subtotal (optional)',
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          TextField(
            controller: _usageLimit,
            decoration: const InputDecoration(
              labelText: 'Usage limit (optional)',
            ),
            keyboardType: TextInputType.number,
          ),
          TextField(
            controller: _startsAt,
            decoration: const InputDecoration(
              labelText: 'Starts at (ISO UTC, optional)',
            ),
          ),
          TextField(
            controller: _endsAt,
            decoration: const InputDecoration(
              labelText: 'Ends at (ISO UTC, optional)',
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () async {
              if (_name.text.trim().isEmpty || _value.text.trim().isEmpty) {
                return;
              }
              await ref
                  .read(promotionsControllerProvider.notifier)
                  .create(
                    name: _name.text,
                    promotionType: _type,
                    value: _value.text,
                    minimumSubtotal: _minimumSubtotal.text,
                    usageLimit: int.tryParse(_usageLimit.text.trim()),
                    startsAt: DateTime.tryParse(_startsAt.text),
                    endsAt: DateTime.tryParse(_endsAt.text),
                  );
              if (!mounted) return;
              _name.clear();
              _value.clear();
              _minimumSubtotal.clear();
              _usageLimit.clear();
              _startsAt.clear();
              _endsAt.clear();
            },
            child: const Text('Create promotion'),
          ),
          const SizedBox(height: 16),
          for (final item in items)
            Card(
              child: ListTile(
                onTap: () => _showDetails(item),
                title: Text(item.name),
                subtitle: Text(
                  '${item.promotionType} · ${item.value} · ${item.redemptionCount} used',
                ),
                trailing: IconButton(
                  tooltip: 'Delete promotion',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => ref
                      .read(promotionsControllerProvider.notifier)
                      .remove(item.id),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _showDetails(PromotionRecord promotion) async {
    final repository = ref.read(promotionsRepositoryProvider);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 16,
              bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
            ),
            child:
                FutureBuilder<
                  ({
                    List<PromotionCode> codes,
                    List<PromotionProductScope> scopes,
                  })
                >(
                  future: _loadDetails(repository, promotion.id),
                  builder: (context, snapshot) {
                    if (!snapshot.hasData) {
                      return const SizedBox(
                        height: 160,
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    final details = snapshot.data!;
                    return ListView(
                      shrinkWrap: true,
                      children: [
                        Text(
                          promotion.name,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const Text('Codes'),
                        for (final code in details.codes)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(code.code),
                            subtitle: Text('${code.redemptionCount} used'),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () async {
                                await repository.deleteCode(code.id);
                                setModalState(() {});
                              },
                            ),
                          ),
                        OutlinedButton(
                          onPressed: () async {
                            final code = await _ask(
                              context,
                              'New promotion code',
                            );
                            if (code == null || code.trim().isEmpty) return;
                            await repository.createCode(
                              promotionId: promotion.id,
                              code: code,
                            );
                            setModalState(() {});
                          },
                          child: const Text('Add code'),
                        ),
                        const SizedBox(height: 12),
                        const Text('Product scope'),
                        for (final scope in details.scopes)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(scope.productName),
                            subtitle: Text(
                              scope.variantName ?? scope.productId,
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () async {
                                await repository.removeProductScope(scope.id);
                                setModalState(() {});
                              },
                            ),
                          ),
                        OutlinedButton(
                          onPressed: () async {
                            final productId = await _ask(context, 'Product ID');
                            if (productId == null || productId.trim().isEmpty) {
                              return;
                            }
                            if (!context.mounted) return;
                            final variantId = await _ask(
                              context,
                              'Variant ID (optional)',
                            );
                            await repository.assignProductScope(
                              promotionId: promotion.id,
                              productId: productId,
                              variantId: variantId,
                            );
                            setModalState(() {});
                          },
                          child: const Text('Add product scope'),
                        ),
                      ],
                    );
                  },
                ),
          ),
        ),
      ),
    );
  }

  Future<({List<PromotionCode> codes, List<PromotionProductScope> scopes})>
  _loadDetails(PromotionsRepository repository, String promotionId) async {
    final values = await Future.wait([
      repository.listCodes(promotionId),
      repository.listProductScopes(promotionId),
    ]);
    return (
      codes: values[0] as List<PromotionCode>,
      scopes: values[1] as List<PromotionProductScope>,
    );
  }

  Future<String?> _ask(BuildContext context, String label) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(label),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
