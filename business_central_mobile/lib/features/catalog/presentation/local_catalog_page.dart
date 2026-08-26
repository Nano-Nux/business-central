import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../domain/catalog_models.dart';
import 'local_catalog_controller.dart';
import 'measurement_page.dart';

class LocalCatalogPage extends ConsumerStatefulWidget {
  const LocalCatalogPage({super.key});

  @override
  ConsumerState<LocalCatalogPage> createState() => _LocalCatalogPageState();
}

class _LocalCatalogPageState extends ConsumerState<LocalCatalogPage> {
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
    final state = ref.read(localCatalogControllerProvider).asData?.value;
    if (state == null) return;
    for (final product in state.products) {
      final variants = await ref
          .read(localCatalogControllerProvider.notifier)
          .variants(product.id);
      if (!mounted) return;
      if (variants.any((variant) => variant.barcode == code)) {
        setState(() => _query = product.name);
        return;
      }
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('No local catalog variant found for barcode.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final catalog = ref.watch(localCatalogControllerProvider);
    return catalog.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Local catalog could not load: $error')),
      data: (state) {
        final products = state.products
            .where(
              (product) =>
                  product.name.toLowerCase().contains(_query.toLowerCase()),
            )
            .toList();
        return Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Chip(
                  avatar: Icon(Icons.cloud_off_outlined, size: 18),
                  label: Text('Local-only catalog'),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
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
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  children: [
                    FilledButton.tonal(
                      onPressed: () =>
                          _createProduct(context, state.categories),
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
                  ? const Center(child: Text('No local products found.'))
                  : ListView.builder(
                      itemCount: products.length,
                      itemBuilder: (context, index) {
                        final product = products[index];
                        return ListTile(
                          onTap: () => _showProduct(context, product),
                          title: Text(product.name),
                          subtitle: Text(
                            product.categoryNames.isEmpty
                                ? product.productType
                                : '${product.productType} · ${product.categoryNames.join(', ')}',
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (!product.isActive)
                                const Chip(label: Text('Inactive')),
                              IconButton(
                                tooltip: 'Edit product',
                                onPressed: () => _editProduct(
                                  context,
                                  product,
                                  state.categories,
                                ),
                                icon: const Icon(Icons.edit_outlined),
                              ),
                              IconButton(
                                tooltip: 'Delete product',
                                onPressed: () => _run(
                                  () => ref
                                      .read(
                                        localCatalogControllerProvider.notifier,
                                      )
                                      .deleteProduct(product.id),
                                ),
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

  Future<void> _createCategory(BuildContext context) async {
    final values = await _form(context, 'New category', const [
      ('name', 'Category name'),
      ('slug', 'Slug'),
      ('sort_order', 'Sort order (optional)'),
    ]);
    if (values == null) return;
    await _run(
      () => ref
          .read(localCatalogControllerProvider.notifier)
          .createCategory(
            name: values['name']!,
            slug: values['slug']!,
            sortOrder: int.tryParse(values['sort_order'] ?? ''),
          ),
    );
  }

  Future<void> _createProduct(
    BuildContext context,
    List<CatalogCategory> categories,
  ) async {
    final values = await _form(context, 'New product', const [
      ('name', 'Product name'),
      ('product_type', 'Product type (PHYSICAL/SERVICE)'),
    ]);
    if (values == null) return;
    if (!context.mounted) return;
    final categoryIds = await _chooseCategories(context, categories);
    if (categoryIds == null) return;
    await _run(
      () => ref
          .read(localCatalogControllerProvider.notifier)
          .createProduct(
            name: values['name']!,
            productType: values['product_type']!.trim().isEmpty
                ? 'PHYSICAL'
                : values['product_type']!.trim().toUpperCase(),
            isActive: true,
            categoryIds: categoryIds,
          ),
    );
  }

  Future<void> _editProduct(
    BuildContext context,
    CatalogProduct product,
    List<CatalogCategory> categories,
  ) async {
    final values = await _form(
      context,
      'Edit product',
      const [
        ('name', 'Product name'),
        ('product_type', 'Product type'),
        ('is_active', 'Active? (yes/no)'),
      ],
      initial: {
        'name': product.name,
        'product_type': product.productType,
        'is_active': product.isActive ? 'yes' : 'no',
      },
    );
    if (values == null) return;
    if (!context.mounted) return;
    final categoryIds = await _chooseCategories(
      context,
      categories,
      selected: product.categoryIds,
    );
    if (categoryIds == null) return;
    await _run(
      () => ref
          .read(localCatalogControllerProvider.notifier)
          .updateProduct(
            id: product.id,
            name: values['name']!,
            productType: values['product_type']!,
            isActive: values['is_active']!.trim().toLowerCase() != 'no',
            categoryIds: categoryIds,
          ),
    );
  }

  Future<void> _showProduct(BuildContext context, CatalogProduct product) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => FutureBuilder<List<CatalogVariant>>(
        future: ref
            .read(localCatalogControllerProvider.notifier)
            .variants(product.id),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const SizedBox(
              height: 260,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: Text('${snapshot.error}'),
            );
          }
          final variants = snapshot.data ?? const <CatalogVariant>[];
          return SafeArea(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(24),
              children: [
                Text(
                  product.name,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                FilledButton.tonal(
                  onPressed: () => _createVariant(context, product),
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
                        '${variant.sku} · ${variant.unitOfMeasure} · stock ${variant.quantityOnHand ?? '0'}',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: 'Edit variant',
                            onPressed: () => _editVariant(context, variant),
                            icon: const Icon(Icons.edit_outlined),
                          ),
                          IconButton(
                            tooltip: 'Delete variant',
                            onPressed: () => _run(
                              () => ref
                                  .read(localCatalogControllerProvider.notifier)
                                  .deleteVariant(variant.id),
                            ),
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

  Future<void> _createVariant(
    BuildContext context,
    CatalogProduct product,
  ) async {
    final values = await _form(context, 'New variant', const [
      ('sku', 'SKU'),
      ('name', 'Variant name'),
      ('base_unit_id', 'Base unit ID'),
      ('unit_of_measure', 'Unit of measure'),
      ('barcode', 'Barcode (optional)'),
      ('price', 'Price (currency decimal)'),
      ('opening_stock', 'Opening stock quantity (optional)'),
      ('is_stock_tracked', 'Stock tracked? (yes/no)'),
    ]);
    if (values == null) return;
    await _run(
      () => ref
          .read(localCatalogControllerProvider.notifier)
          .createVariant(
            productId: product.id,
            sku: values['sku']!,
            name: values['name']!,
            baseUnitId: values['base_unit_id']!,
            unitOfMeasure: values['unit_of_measure'],
            barcode: values['barcode'],
            price: values['price'],
            quantityOnHand: values['opening_stock'],
            isStockTracked:
                values['is_stock_tracked']!.trim().toLowerCase() != 'no',
          ),
    );
  }

  Future<void> _editVariant(
    BuildContext context,
    CatalogVariant variant,
  ) async {
    final values = await _form(
      context,
      'Edit variant',
      const [
        ('sku', 'SKU'),
        ('name', 'Variant name'),
        ('base_unit_id', 'Base unit ID'),
        ('unit_of_measure', 'Unit of measure'),
        ('barcode', 'Barcode (optional)'),
        ('price', 'Price (currency decimal)'),
        ('is_stock_tracked', 'Stock tracked? (yes/no)'),
      ],
      initial: {
        'sku': variant.sku,
        'name': variant.name,
        'base_unit_id': variant.baseUnitId,
        'unit_of_measure': variant.unitOfMeasure,
        'barcode': variant.barcode ?? '',
        'price': variant.price ?? '',
        'is_stock_tracked': variant.isStockTracked ? 'yes' : 'no',
      },
    );
    if (values == null) return;
    await _run(
      () => ref
          .read(localCatalogControllerProvider.notifier)
          .updateVariant(
            id: variant.id,
            sku: values['sku']!,
            name: values['name']!,
            baseUnitId: values['base_unit_id']!,
            unitOfMeasure: values['unit_of_measure'],
            barcode: values['barcode'],
            price: values['price'],
            isStockTracked:
                values['is_stock_tracked']!.trim().toLowerCase() != 'no',
          ),
    );
  }

  Future<List<String>?> _chooseCategories(
    BuildContext context,
    List<CatalogCategory> categories, {
    List<String> selected = const [],
  }) {
    final chosen = selected.toSet();
    final byId = {for (final category in categories) category.id: category};
    String categoryPath(CatalogCategory category) {
      final names = [category.name];
      final visited = {category.id};
      var parentId = category.parentId;
      while (parentId != null && parentId.isNotEmpty) {
        if (!visited.add(parentId)) break;
        final parent = byId[parentId];
        if (parent == null) break;
        names.insert(0, parent.name);
        parentId = parent.parentId;
      }
      return names.join(' → ');
    }

    return showDialog<List<String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Categories'),
          content: SizedBox(
            width: 360,
            child: categories.isEmpty
                ? const Text('No categories configured.')
                : ListView(
                    shrinkWrap: true,
                    children: [
                      for (final category in categories)
                        CheckboxListTile(
                          value: chosen.contains(category.id),
                          title: Text(categoryPath(category)),
                          onChanged: (value) => setState(() {
                            if (value == true) {
                              chosen.add(category.id);
                            } else {
                              chosen.remove(category.id);
                            }
                          }),
                        ),
                    ],
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Skip'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, chosen.toList()),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Future<Map<String, String>?> _form(
    BuildContext context,
    String title,
    List<(String, String)> fields, {
    Map<String, String> initial = const {},
  }) {
    return showDialog<Map<String, String>>(
      context: context,
      builder: (context) {
        final controllers = {
          for (final field in fields)
            field.$1: TextEditingController(text: initial[field.$1] ?? ''),
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

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$error')));
    }
  }
}
