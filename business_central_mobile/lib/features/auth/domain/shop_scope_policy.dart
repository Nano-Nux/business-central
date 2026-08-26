import '../data/online_auth_api.dart';

class ShopScopePolicy {
  const ShopScopePolicy();

  List<OnlineShop> visibleShops({
    required OnlineUser user,
    required List<OnlineShop> shops,
  }) {
    final scoped = shops.where(
      (shop) => shop.merchantId == user.merchantId && shop.isActive,
    );
    if (user.shopId == null || user.shopId!.isEmpty) return scoped.toList();
    return scoped.where((shop) => shop.id == user.shopId).toList();
  }

  bool canSelectShop(OnlineUser user) {
    if (user.shopId != null && user.shopId!.isNotEmpty) return false;
    return user.platformAdmin ||
        user.roles.any(
          (role) => {'owner', 'merchant'}.contains(role.code.toLowerCase()),
        );
  }

  bool isAllowed(OnlineUser user, String shopId) =>
      user.shopId == null || user.shopId == shopId;
}
