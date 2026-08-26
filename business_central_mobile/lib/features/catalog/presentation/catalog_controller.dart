import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../application/catalog_repository.dart';
import '../data/online_catalog_repository.dart';
import '../data/catalog_cache_repository.dart';
import '../data/online_pricing_repository.dart';
import '../data/local_pricing_repository.dart';
import '../domain/catalog_models.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';

final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  return OnlineCatalogRepository(
    ref.watch(onlineAuthApiProvider),
    CatalogCacheRepository(ref.watch(appDatabaseProvider)),
  );
});

final pricingRepositoryProvider = Provider<PricingRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalPricingRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
    );
  }
  return OnlinePricingRepository(ref.watch(onlineAuthApiProvider));
});

class CatalogState {
  const CatalogState({required this.categories, required this.products});
  final List<CatalogCategory> categories;
  final List<CatalogProduct> products;
}

final catalogControllerProvider =
    AsyncNotifierProvider<CatalogController, CatalogState>(
      CatalogController.new,
    );

class CatalogController extends AsyncNotifier<CatalogState> {
  @override
  Future<CatalogState> build() => _load();

  Future<CatalogState> _load() async {
    final repository = ref.read(catalogRepositoryProvider);
    final workspace = ref.read(onlineWorkspaceControllerProvider).asData?.value;
    if (workspace == null) throw StateError('Workspace is not ready.');
    final results = await Future.wait([
      repository.listCategories(merchantId: workspace.merchant.id),
      repository.listProducts(merchantId: workspace.merchant.id),
    ]);
    return CatalogState(
      categories: results[0] as List<CatalogCategory>,
      products: results[1] as List<CatalogProduct>,
    );
  }

  Future<List<CatalogVariant>> variants(String productId) async {
    final workspace = ref.read(onlineWorkspaceControllerProvider).asData?.value;
    if (workspace == null) throw StateError('Workspace is not ready.');
    return ref
        .read(catalogRepositoryProvider)
        .listVariants(merchantId: workspace.merchant.id, productId: productId);
  }

  Future<void> createCategory({
    required String name,
    required String slug,
    String? parentId,
    int? sortOrder,
  }) async {
    await ref
        .read(catalogRepositoryProvider)
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
        .read(catalogRepositoryProvider)
        .updateCategory(
          id: id,
          name: name,
          slug: slug,
          parentId: parentId,
          sortOrder: sortOrder,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> deleteCategory({required String id}) async {
    await ref.read(catalogRepositoryProvider).deleteCategory(id: id);
    state = await AsyncValue.guard(_load);
  }

  Future<void> createProduct({
    required String name,
    required String productType,
    required bool isActive,
    List<String> categoryIds = const [],
  }) async {
    await ref
        .read(catalogRepositoryProvider)
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
        .read(catalogRepositoryProvider)
        .updateProduct(
          id: id,
          name: name,
          productType: productType,
          isActive: isActive,
          categoryIds: categoryIds,
        );
    state = await AsyncValue.guard(_load);
  }

  Future<void> deleteProduct({required String id}) async {
    await ref.read(catalogRepositoryProvider).deleteProduct(id: id);
    state = await AsyncValue.guard(_load);
  }

  Future<CatalogVariant> createVariant({
    required String productId,
    required String sku,
    required String name,
    required String baseUnitId,
    String? barcode,
    String? unitOfMeasure,
    required bool isStockTracked,
  }) {
    return ref
        .read(catalogRepositoryProvider)
        .createVariant(
          productId: productId,
          sku: sku,
          name: name,
          baseUnitId: baseUnitId,
          barcode: barcode,
          unitOfMeasure: unitOfMeasure,
          isStockTracked: isStockTracked,
        );
  }

  Future<void> deleteVariant({required String id}) {
    return ref.read(catalogRepositoryProvider).deleteVariant(id: id);
  }
}
