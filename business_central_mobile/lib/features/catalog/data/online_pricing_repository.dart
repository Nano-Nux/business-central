import '../../../features/auth/data/online_auth_api.dart';
import '../application/catalog_repository.dart';
import '../domain/catalog_models.dart';

class OnlinePricingRepository implements PricingRepository {
  OnlinePricingRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<CatalogPriceList>> listPriceLists({
    required String merchantId,
  }) async => [
    for (final item in await api.getCollection(
      '/pricing/price-lists?page_index=0&page_size=100',
    ))
      CatalogPriceList.fromJson(item),
  ];

  @override
  Future<List<CatalogProductPrice>> listPrices({
    required String priceListId,
  }) async => [
    for (final item in await api.getCollection(
      '/pricing/price-lists/$priceListId/prices?page_index=0&page_size=500',
    ))
      CatalogProductPrice.fromJson(item),
  ];

  @override
  Future<CatalogPriceList> createPriceList({
    required String code,
    required String currencyCode,
    required bool isDefault,
  }) async {
    final data = await api.postResource('/pricing/price-lists', {
      'code': code.trim(),
      'currency_code': currencyCode.trim(),
      'is_default': isDefault,
    });
    return CatalogPriceList.fromJson(data);
  }

  @override
  Future<void> deletePriceList({required String id}) {
    return api.deleteResource('/pricing/price-lists/$id');
  }

  @override
  Future<CatalogProductPrice> upsertPrice({
    required String priceListId,
    required String variantId,
    required String amount,
  }) async {
    final data = await api.postResource('/pricing/prices', {
      'price_list_id': priceListId,
      'variant_id': variantId,
      'amount': amount.trim(),
    });
    return CatalogProductPrice.fromJson(data);
  }

  @override
  Future<void> deletePrice({
    required String priceListId,
    required String variantId,
  }) async {
    await api.deleteResource(
      '/pricing/prices',
      body: {'price_list_id': priceListId, 'variant_id': variantId},
    );
  }
}
