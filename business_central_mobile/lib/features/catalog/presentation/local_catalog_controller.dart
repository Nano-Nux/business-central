import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../data/local_catalog_repository.dart';
import '../domain/catalog_models.dart';

final localCatalogRepositoryProvider = Provider<LocalCatalogRepository>((ref) {
  final auth = ref.watch(localAuthControllerProvider).asData?.value;
  final merchantId = auth?.merchantId;
  if (merchantId == null) {
    throw StateError('Local workspace is not authenticated.');
  }
  return LocalCatalogRepository(
    database: ref.watch(appDatabaseProvider),
    merchantId: merchantId,
  );
});

class LocalCatalogState {
  const LocalCatalogState({required this.categories, required this.products});
  final List<CatalogCategory> categories;
  final List<CatalogProduct> products;
}

final localCatalogControllerProvider =
    AsyncNotifierProvider<LocalCatalogController, LocalCatalogState>(
      LocalCatalogController.new,
    );

class LocalCatalogController extends AsyncNotifier<LocalCatalogState> {
  @override
  Future<LocalCatalogState> build() => _load();

  Future<LocalCatalogState> _load() async {
    final repository = ref.read(localCatalogRepositoryProvider);
    final results = await Future.wait([
      repository.listCategories(),
      repository.listProducts(),
    ]);
    return LocalCatalogState(
      categories: results[0] as List<CatalogCategory>,
      products: results[1] as List<CatalogProduct>,
    );
  }

  Future<List<CatalogVariant>> variants(String productId) =>
      ref.read(localCatalogRepositoryProvider).listVariants(productId);

  Future<void> createCategory({
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  }) async {
    await ref
        .read(localCatalogRepositoryProvider)
        .createCategory(
          name: name,
          slug: slug,
          parentId: parentId,
          sortOrder: sortOrder,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> updateCategory({
    required String id,
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  }) async {
    await ref
        .read(localCatalogRepositoryProvider)
        .updateCategory(
          id: id,
          name: name,
          slug: slug,
          parentId: parentId,
          sortOrder: sortOrder,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> deleteCategory(String id) async {
    await ref.read(localCatalogRepositoryProvider).deleteCategory(id);
    state = await AsyncValue.guard(_load);
  }

  Future<void> createProduct({
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  }) async {
    await ref
        .read(localCatalogRepositoryProvider)
        .createProduct(
          name: name,
          productType: productType,
          isActive: isActive,
          categoryIds: categoryIds,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> updateProduct({
    required String id,
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  }) async {
    await ref
        .read(localCatalogRepositoryProvider)
        .updateProduct(
          id: id,
          name: name,
          productType: productType,
          isActive: isActive,
          categoryIds: categoryIds,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> deleteProduct(String id) async {
    await ref.read(localCatalogRepositoryProvider).deleteProduct(id);
    state = await AsyncValue.guard(_load);
  }

  Future<void> createVariant({
    required String productId,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    String? price,
    String? quantityOnHand,
    required bool isStockTracked,
  }) async {
    await ref
        .read(localCatalogRepositoryProvider)
        .createVariant(
          productId: productId,
          sku: sku,
          name: name,
          baseUnitId: baseUnitId,
          barcode: barcode,
          unitOfMeasure: unitOfMeasure,
          price: price,
          quantityOnHand: quantityOnHand,
          isStockTracked: isStockTracked,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> updateVariant({
    required String id,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    String? price,
    required bool isStockTracked,
  }) async {
    await ref
        .read(localCatalogRepositoryProvider)
        .updateVariant(
          id: id,
          sku: sku,
          name: name,
          baseUnitId: baseUnitId,
          barcode: barcode,
          unitOfMeasure: unitOfMeasure,
          price: price,
          isStockTracked: isStockTracked,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> deleteVariant(String id) async {
    await ref.read(localCatalogRepositoryProvider).deleteVariant(id);
    state = await AsyncValue.guard(_load);
  }
}
