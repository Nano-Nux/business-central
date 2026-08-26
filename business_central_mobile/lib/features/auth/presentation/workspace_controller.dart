import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/network/network_boundary.dart';
import '../data/online_auth_api.dart';
import '../data/workspace_cache_repository.dart';
import '../domain/shop_scope_policy.dart';
import 'online_auth_controller.dart';

class OnlineWorkspaceState {
  const OnlineWorkspaceState({
    required this.merchant,
    required this.user,
    required this.shops,
    required this.selectedShop,
  });
  final OnlineMerchant merchant;
  final OnlineUser user;
  final List<OnlineShop> shops;
  final OnlineShop selectedShop;
  bool get canSelectShop => const ShopScopePolicy().canSelectShop(user);
}

final onlineWorkspaceControllerProvider =
    AsyncNotifierProvider<OnlineWorkspaceController, OnlineWorkspaceState?>(
      OnlineWorkspaceController.new,
    );

class OnlineWorkspaceController extends AsyncNotifier<OnlineWorkspaceState?> {
  @override
  Future<OnlineWorkspaceState?> build() async {
    final connected = await ref.read(networkReadinessProvider.future);
    if (!connected) throw const NetworkDeniedException();
    final auth = ref.watch(onlineAuthControllerProvider);
    if (auth.hasError) throw auth.error!;
    final session = auth.asData?.value;
    if (session == null) return null;
    final api = ref.read(onlineAuthApiProvider);
    final merchant = await api.currentMerchant();
    final allShops = await api.listShops();
    if (merchant.id != session.user.merchantId) {
      throw StateError(
        'Backend returned a merchant outside the authenticated tenant.',
      );
    }
    final shops = const ShopScopePolicy().visibleShops(
      user: session.user,
      shops: allShops,
    );
    if (shops.isEmpty) {
      throw StateError('No active shop is available for this membership.');
    }
    await WorkspaceCacheRepository(
      ref.read(appDatabaseProvider),
    ).save(merchant: merchant, shops: shops);
    final selected = shops.firstWhere(
      (shop) => shop.id == session.user.shopId,
      orElse: () => shops.first,
    );
    return OnlineWorkspaceState(
      merchant: merchant,
      user: session.user,
      shops: shops,
      selectedShop: selected,
    );
  }

  void selectShop(String shopId) {
    final current = state.asData?.value;
    if (current == null || !current.canSelectShop) return;
    final next = current.shops.where((shop) => shop.id == shopId).firstOrNull;
    if (next == null) return;
    state = AsyncData(
      OnlineWorkspaceState(
        merchant: current.merchant,
        user: current.user,
        shops: current.shops,
        selectedShop: next,
      ),
    );
  }
}
