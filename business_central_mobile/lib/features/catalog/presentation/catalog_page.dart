import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../domain/catalog_models.dart';
import 'catalog_controller.dart';
import 'measurement_page.dart';

class CatalogPage extends ConsumerStatefulWidget {
  const CatalogPage({super.key, this.allowMutations = false});

  final bool allowMutations;

  @override
  ConsumerState<CatalogPage> createState() => _CatalogPageState();
}

class _CatalogPageState extends ConsumerState<CatalogPage> {
  String _query = '';

  Future<void> _scanCatalog() async {
    final code = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => SizedBox(
        height: MediaQuery.sizeOf(context).height * .65,
        child: MobileScanner(
          onDetect: (capture) {
            final value = capture.barcodes
                .map((barcode) => barcode.rawValue)
                .whereType<String>()
                .firstOrNull;
            if (value != null && value.isNotEmpty && mounted) {
              Navigator.of(context).pop(value);
            }
          },
        ),
      ),
    );
    if (code == null || !mounted) return;
    final state = ref.read(catalogControllerProvider).asData?.value;
    if (state == null) return;
    for (final product in state.products) {
      final variants = await ref
          .read(catalogControllerProvider.notifier)
          .variants(product.id);
      if (!mounted) return;
      if (variants.any((variant) => variant.barcode == code)) {
        setState(() => _query = product.name);
        return;
      }
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('No catalog variant found for barcode.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final catalog = ref.watch(catalogControllerProvider);
    return catalog.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Catalog could not load: $error')),
      data: (state) {
        final products = state.products
            .where(
              (product) =>
                  product.name.toLowerCase().contains(_query.toLowerCase()),
            )
            .toList();
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      onChanged: (value) => setState(() => _query = value),
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.search),
                        labelText: 'Search products, SKU or barcode',
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Scan barcode',
                    onPressed: _scanCatalog,
                    icon: const Icon(Icons.qr_code_scanner),
                  ),
                  IconButton(
                    tooltip: 'Camera barcode scan',
                    onPressed: _scanCatalog,
                    icon: const Icon(Icons.photo_camera_outlined),
                  ),
                ],
              ),
            ),
            if (widget.allowMutations)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Wrap(
                    spacing: 8,
                    children: [
                      FilledButton.tonal(
                        onPressed: () => _createProduct(context),
                        child: const Text('New product'),
                      ),
                      OutlinedButton(
                        onPressed: () => _createCategory(context),
                        child: const Text('New category'),
                      ),
                      OutlinedButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const MeasurementPage(),
                          ),
                        ),
                        child: const Text('Units & conversions'),
                      ),
                    ],
                  ),
                ),
              ),
            Expanded(
              child: products.isEmpty
                  ? const Center(child: Text('No products found.'))
                  : ListView.builder(
                      itemCount: products.length,
                      itemBuilder: (context, index) {
                        final product = products[index];
                        return ListTile(
                          onTap: () => _showVariants(product),
                          title: Text(product.name),
                          subtitle: Text(
                            product.categoryNames.isEmpty
                                ? product.productType
                                : '${product.productType} · ${product.categoryNames.join(', ')}',
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              product.isActive
                                  ? const Icon(Icons.check_circle_outline)
                                  : const Chip(label: Text('Inactive')),
                              if (widget.allowMutations)
                                IconButton(
                                  tooltip: 'Delete product',
                                  onPressed: () => _deleteProduct(product),
                                  icon: const Icon(Icons.delete_outline),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _createProduct(BuildContext context) async {
    final values = await _form(
      context,
      title: 'New product',
      fields: const [
        ('name', 'Product name'),
        ('product_type', 'Product type (PHYSICAL/SERVICE)'),
      ],
    );
    if (values == null || values['name']!.trim().isEmpty) return;
    await _runMutation(
      ref
          .read(catalogControllerProvider.notifier)
          .createProduct(
            name: values['name']!,
            productType: values['product_type']!.trim().isEmpty
                ? 'PHYSICAL'
                : values['product_type']!.trim().toUpperCase(),
            isActive: true,
          ),
    );
  }

  Future<void> _createCategory(BuildContext context) async {
    final values = await _form(
      context,
      title: 'New category',
      fields: const [('name', 'Category name'), ('slug', 'Slug')],
    );
    if (values == null ||
        values['name']!.trim().isEmpty ||
        values['slug']!.trim().isEmpty) {
      return;
    }
    await _runMutation(
      ref
          .read(catalogControllerProvider.notifier)
          .createCategory(name: values['name']!, slug: values['slug']!),
    );
  }

  Future<void> _deleteProduct(CatalogProduct product) async {
    await _runMutation(
      ref
          .read(catalogControllerProvider.notifier)
          .deleteProduct(id: product.id),
    );
  }

  Future<void> _runMutation(Future<void> action) async {
    try {
      await action;
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$error')));
    }
  }

  Future<Map<String, String>?> _form(
    BuildContext context, {
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

  Future<void> _showVariants(CatalogProduct product) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => FutureBuilder<List<CatalogVariant>>(
        future: ref
            .read(catalogControllerProvider.notifier)
            .variants(product.id),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const SizedBox(
              height: 220,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Variants could not load: ${snapshot.error}'),
            );
          }
          final variants = snapshot.data!;
          return SafeArea(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(24),
              children: [
                Text(
                  product.name,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                if (widget.allowMutations)
                  FilledButton.tonal(
                    onPressed: () async {
                      final values = await _form(
                        context,
                        title: 'New variant',
                        fields: const [
                          ('sku', 'SKU'),
                          ('name', 'Variant name'),
                          ('base_unit_id', 'Base unit ID'),
                          ('unit_of_measure', 'Unit of measure'),
                        ],
                      );
                      if (values == null ||
                          values['sku']!.trim().isEmpty ||
                          values['name']!.trim().isEmpty ||
                          values['base_unit_id']!.trim().isEmpty) {
                        return;
                      }
                      try {
                        await ref
                            .read(catalogControllerProvider.notifier)
                            .createVariant(
                              productId: product.id,
                              sku: values['sku']!,
                              name: values['name']!,
                              baseUnitId: values['base_unit_id']!,
                              unitOfMeasure: values['unit_of_measure'],
                              isStockTracked: true,
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
                    child: const Text('Add variant'),
                  ),
                if (variants.isEmpty)
                  const ListTile(title: Text('No variants configured.'))
                else
                  for (final variant in variants)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(variant.name),
                      subtitle: Text(
                        '${variant.sku} · ${variant.unitOfMeasure}',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            variant.isStockTracked
                                ? 'Stock tracked'
                                : 'Not tracked',
                          ),
                          if (widget.allowMutations)
                            IconButton(
                              tooltip: 'Delete variant',
                              onPressed: () async {
                                await ref
                                    .read(catalogControllerProvider.notifier)
                                    .deleteVariant(id: variant.id);
                                if (context.mounted) Navigator.pop(context);
                              },
                              icon: const Icon(Icons.delete_outline),
                            ),
                        ],
                      ),
                    ),
              ],
            ),
          );
        },
      ),
    );
  }
}
