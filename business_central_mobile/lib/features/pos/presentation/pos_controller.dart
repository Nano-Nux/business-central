import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../data/local_pos_repository.dart';
import '../application/pos_repository.dart';
import '../data/online_pos_repository.dart';
import '../domain/pos_models.dart';

final posRepositoryProvider = Provider<PosRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null || auth?.shopId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalPosRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
      actorMembershipId: auth.membershipId,
    );
  }
  return OnlinePosRepository(ref.watch(onlineAuthApiProvider));
});

class PosState {
  const PosState({required this.catalog, required this.cart, this.quote});
  final List<PosCatalogItem> catalog;
  final List<PosCartLine> cart;
  final PosQuote? quote;
}

final posControllerProvider = AsyncNotifierProvider<PosController, PosState>(
  PosController.new,
);

class PosController extends AsyncNotifier<PosState> {
  String _checkoutKey = const Uuid().v4();

  @override
  Future<PosState> build() async {
    final shopId = _shopId();
    return PosState(
      catalog: await ref.read(posRepositoryProvider).catalog(shopId: shopId),
      cart: const [],
    );
  }

  void add(PosCatalogItem item) {
    final current = state.asData?.value;
    if (current == null) return;
    final existing = current.cart
        .where(
          (line) =>
              line.item.id == item.id &&
              line.item.stockAssetId == item.stockAssetId,
        )
        .firstOrNull;
    final cart = existing == null
        ? [...current.cart, PosCartLine(item: item, quantity: 1)]
        : [
            for (final line in current.cart)
              line.item.id == item.id &&
                      line.item.stockAssetId == item.stockAssetId
                  ? line.copyWith(quantity: line.quantity + 1)
                  : line,
          ];
    state = AsyncData(PosState(catalog: current.catalog, cart: cart));
  }

  Future<List<PosCatalogItem>> lookupBarcode(String barcode) async {
    final matches = await ref
        .read(posRepositoryProvider)
        .lookupBarcode(shopId: _shopId(), barcode: barcode);
    if (matches.length == 1) add(matches.single);
    return matches;
  }

  void remove(PosCatalogItem item) {
    final current = state.asData?.value;
    if (current == null) return;
    final cart = [
      for (final line in current.cart)
        if (line.item.id != item.id ||
            line.item.stockAssetId != item.stockAssetId ||
            line.quantity > 1)
          line.item.id == item.id && line.item.stockAssetId == item.stockAssetId
              ? line.copyWith(quantity: line.quantity - 1)
              : line,
    ];
    state = AsyncData(PosState(catalog: current.catalog, cart: cart));
  }

  Future<void> requestQuote({String? deliveryId, String? promotionId}) async {
    final current = state.asData?.value;
    if (current == null) return;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final quote = await ref
          .read(posRepositoryProvider)
          .quote(
            shopId: _shopId(),
            lines: current.cart,
            deliveryId: deliveryId,
            promotionId: promotionId,
          );
      return PosState(
        catalog: current.catalog,
        cart: current.cart,
        quote: quote,
      );
    });
  }

  void clearQuote() {
    final current = state.asData?.value;
    if (current != null && current.quote != null) {
      state = AsyncData(PosState(catalog: current.catalog, cart: current.cart));
    }
  }

  Future<PosCheckoutResult> checkout({
    required String paymentMethod,
    String? deliveryId,
    String? promotionId,
    String? customerName,
    String? customerPhone,
    String? note,
  }) async {
    final current = state.asData?.value;
    if (current == null) {
      throw StateError('Workspace is not ready.');
    }
    if (current.quote == null) {
      throw StateError('Request an authoritative quote before checkout.');
    }
    state = const AsyncLoading();
    try {
      final result = await ref
          .read(posRepositoryProvider)
          .checkout(
            shopId: _shopId(),
            lines: current.cart,
            paymentMethod: paymentMethod,
            deliveryId: deliveryId,
            promotionId: promotionId,
            customerName: customerName,
            customerPhone: customerPhone,
            note: note,
            idempotencyKey: _checkoutKey,
          );
      state = AsyncData(PosState(catalog: current.catalog, cart: const []));
      _checkoutKey = const Uuid().v4();
      return result;
    } catch (error, stackTrace) {
      state = AsyncData(current);
      Error.throwWithStackTrace(error, stackTrace);
    }
  }

  String _shopId() {
    if (ref.read(configurationProvider).isFullyOffline) {
      final auth = ref.read(localAuthControllerProvider).asData?.value;
      final shopId = auth?.shopId;
      if (shopId == null) throw StateError('Local workspace is not ready.');
      return shopId;
    }
    final workspace = ref.read(onlineWorkspaceControllerProvider).asData?.value;
    if (workspace == null) throw StateError('Workspace is not ready.');
    return workspace.selectedShop.id;
  }
}
