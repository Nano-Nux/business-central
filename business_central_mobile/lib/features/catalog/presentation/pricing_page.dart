import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../../pos/presentation/pos_controller.dart';
import '../domain/catalog_models.dart';
import 'catalog_controller.dart';

class PricingPage extends ConsumerWidget {
  const PricingPage({super.key, this.allowMutations = false});

  final bool allowMutations;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(configurationProvider).isFullyOffline) {
      final auth = ref.watch(localAuthControllerProvider).asData?.value;
      if (auth?.merchantId == null) {
        return const Center(child: Text('Sign in to manage local pricing.'));
      }
      return _PricingBody(
        key: ValueKey(auth!.merchantId),
        merchantId: auth.merchantId!,
        allowMutations: allowMutations,
      );
    }
    final workspace = ref.watch(onlineWorkspaceControllerProvider);
    return workspace.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Pricing could not load: $error')),
      data: (value) => value == null
          ? const Center(child: Text('Sign in to manage pricing.'))
          : _PricingBody(
              key: ValueKey(value.merchant.id),
              merchantId: value.merchant.id,
              allowMutations: allowMutations,
            ),
    );
  }
}

class _PricingBody extends ConsumerStatefulWidget {
  const _PricingBody({
    required this.merchantId,
    required this.allowMutations,
    super.key,
  });

  final String merchantId;
  final bool allowMutations;

  @override
  ConsumerState<_PricingBody> createState() => _PricingBodyState();
}

class _PricingBodyState extends ConsumerState<_PricingBody> {
  late Future<List<CatalogPriceList>> _priceLists;
  String? _selectedPriceListId;
  final _variantId = TextEditingController();
  final _amount = TextEditingController();

  @override
  void initState() {
    super.initState();
    _priceLists = _loadPriceLists();
  }

  @override
  void dispose() {
    _variantId.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<List<CatalogPriceList>> _loadPriceLists() {
    return ref
        .read(pricingRepositoryProvider)
        .listPriceLists(merchantId: widget.merchantId);
  }

  Future<List<CatalogProductPrice>> _loadPrices(String id) {
    return ref.read(pricingRepositoryProvider).listPrices(priceListId: id);
  }

  Future<void> _createPriceList() async {
    final values = await _showForm(
      title: 'New price list',
      fields: const [('code', 'Code'), ('currency', 'Currency code')],
    );
    if (values == null ||
        values['code']!.trim().isEmpty ||
        values['currency']!.trim().isEmpty) {
      return;
    }
    try {
      final created = await ref
          .read(pricingRepositoryProvider)
          .createPriceList(
            code: values['code']!,
            currencyCode: values['currency']!,
            isDefault: false,
          );
      if (!mounted) return;
      setState(() {
        _selectedPriceListId = created.id;
        _priceLists = _loadPriceLists();
      });
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _upsertPrice(String priceListId) async {
    if (_variantId.text.trim().isEmpty || _amount.text.trim().isEmpty) return;
    try {
      await ref
          .read(pricingRepositoryProvider)
          .upsertPrice(
            priceListId: priceListId,
            variantId: _variantId.text.trim(),
            amount: _amount.text.trim(),
          );
      _amount.clear();
      if (mounted) setState(() {});
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _deletePriceList(String id) async {
    try {
      await ref.read(pricingRepositoryProvider).deletePriceList(id: id);
      if (!mounted) return;
      setState(() {
        if (_selectedPriceListId == id) _selectedPriceListId = null;
        _priceLists = _loadPriceLists();
      });
    } catch (error) {
      _showError('$error');
    }
  }

  Future<void> _deletePrice(String priceListId, String variantId) async {
    try {
      await ref
          .read(pricingRepositoryProvider)
          .deletePrice(priceListId: priceListId, variantId: variantId);
      if (mounted) setState(() {});
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

  @override
  Widget build(BuildContext context) {
    final pos = ref.watch(posControllerProvider);
    final variants = pos.asData?.value.catalog ?? const [];
    return FutureBuilder<List<CatalogPriceList>>(
      future: _priceLists,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: Text('Price lists could not load: ${snapshot.error}'),
          );
        }
        final lists = snapshot.data ?? const <CatalogPriceList>[];
        final selectedId =
            _selectedPriceListId ?? (lists.isEmpty ? null : lists.first.id);
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Pricing', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              ref.watch(configurationProvider).isFullyOffline
                  ? 'Local variant prices are managed by price list and used by local POS.'
                  : 'Backend-authoritative variant prices are managed by price list.',
            ),
            const SizedBox(height: 12),
            if (widget.allowMutations)
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.tonal(
                  onPressed: _createPriceList,
                  child: const Text('New price list'),
                ),
              ),
            if (lists.isEmpty)
              const Card(
                child: ListTile(title: Text('No price lists configured.')),
              )
            else
              for (final priceList in lists)
                Card(
                  color: priceList.id == selectedId
                      ? Theme.of(context).colorScheme.primaryContainer
                      : null,
                  child: ListTile(
                    onTap: () =>
                        setState(() => _selectedPriceListId = priceList.id),
                    title: Text(priceList.code),
                    subtitle: Text(priceList.currencyCode),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (priceList.isDefault)
                          const Chip(label: Text('Default')),
                        if (widget.allowMutations)
                          IconButton(
                            tooltip: 'Delete price list',
                            onPressed: () => _deletePriceList(priceList.id),
                            icon: const Icon(Icons.delete_outline),
                          ),
                      ],
                    ),
                  ),
                ),
            if (selectedId != null) ...[
              const SizedBox(height: 16),
              Text('Prices', style: Theme.of(context).textTheme.titleLarge),
              if (widget.allowMutations)
                Row(
                  children: [
                    Expanded(
                      child: variants.isEmpty
                          ? TextField(
                              controller: _variantId,
                              decoration: const InputDecoration(
                                labelText: 'Variant ID',
                              ),
                            )
                          : DropdownButtonFormField<String>(
                              initialValue:
                                  variants.any(
                                    (item) => item.id == _variantId.text,
                                  )
                                  ? _variantId.text
                                  : null,
                              decoration: const InputDecoration(
                                labelText: 'Variant',
                              ),
                              items: [
                                for (final item in variants)
                                  DropdownMenuItem(
                                    value: item.id,
                                    child: Text('${item.name} · ${item.sku}'),
                                  ),
                              ],
                              onChanged: (value) =>
                                  setState(() => _variantId.text = value ?? ''),
                            ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 120,
                      child: TextField(
                        controller: _amount,
                        decoration: const InputDecoration(labelText: 'Amount'),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Save price',
                      onPressed: () => _upsertPrice(selectedId),
                      icon: const Icon(Icons.save_outlined),
                    ),
                  ],
                ),
              FutureBuilder<List<CatalogProductPrice>>(
                future: _loadPrices(selectedId),
                builder: (context, priceSnapshot) {
                  if (priceSnapshot.connectionState ==
                      ConnectionState.waiting) {
                    return const LinearProgressIndicator();
                  }
                  if (priceSnapshot.hasError) {
                    return Text(
                      'Prices could not load: ${priceSnapshot.error}',
                    );
                  }
                  final prices = priceSnapshot.data ?? const [];
                  if (prices.isEmpty) {
                    return const Text('No prices configured.');
                  }
                  return Column(
                    children: [
                      for (final price in prices)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(price.variantId),
                          subtitle: Text(price.validFrom.toIso8601String()),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(price.amount),
                              if (widget.allowMutations)
                                IconButton(
                                  tooltip: 'Delete price',
                                  onPressed: () =>
                                      _deletePrice(selectedId, price.variantId),
                                  icon: const Icon(Icons.delete_outline),
                                ),
                            ],
                          ),
                        ),
                    ],
                  );
                },
              ),
            ],
          ],
        );
      },
    );
  }

  Future<Map<String, String>?> _showForm({
    required String title,
    required List<(String, String)> fields,
  }) {
    return showDialog<Map<String, String>>(
      context: context,
      builder: (context) {
        final controllers = {
          for (final field in fields) field.$1: TextEditingController(),
        };
        return AlertDialog(
          title: Text(title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final field in fields)
                TextField(
                  controller: controllers[field.$1],
                  decoration: InputDecoration(labelText: field.$2),
                ),
            ],
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
