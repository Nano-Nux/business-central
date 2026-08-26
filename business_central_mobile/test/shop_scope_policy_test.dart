import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/features/auth/data/online_auth_api.dart';
import 'package:business_central_mobile/features/auth/domain/shop_scope_policy.dart';

void main() {
  const policy = ShopScopePolicy();
  const owner = OnlineUser(
    id: 'user-owner',
    membershipId: 'membership-owner',
    merchantId: 'merchant-a',
    email: 'owner@example.com',
    displayName: 'Owner',
    isActive: true,
    roles: [
      OnlineRole(code: 'merchant', permissionCodes: ['tenant.read']),
    ],
    platformAdmin: false,
  );
  const staff = OnlineUser(
    id: 'user-staff',
    membershipId: 'membership-staff',
    merchantId: 'merchant-a',
    email: 'staff@example.com',
    displayName: 'Staff',
    isActive: true,
    roles: [
      OnlineRole(code: 'staff', permissionCodes: ['tenant.read']),
    ],
    platformAdmin: false,
    shopId: 'shop-a',
  );
  const shops = [
    OnlineShop(
      id: 'shop-a',
      merchantId: 'merchant-a',
      name: 'A',
      code: 'A',
      moduleCodes: [],
      isActive: true,
    ),
    OnlineShop(
      id: 'shop-b',
      merchantId: 'merchant-a',
      name: 'B',
      code: 'B',
      moduleCodes: [],
      isActive: true,
    ),
    OnlineShop(
      id: 'shop-other',
      merchantId: 'merchant-b',
      name: 'Other',
      code: 'O',
      moduleCodes: [],
      isActive: true,
    ),
  ];

  test('merchant sees active shops only within its merchant', () {
    expect(
      policy.visibleShops(user: owner, shops: shops).map((shop) => shop.id),
      ['shop-a', 'shop-b'],
    );
    expect(policy.canSelectShop(owner), isTrue);
  });

  test('staff is locked to the assigned shop', () {
    expect(
      policy.visibleShops(user: staff, shops: shops).map((shop) => shop.id),
      ['shop-a'],
    );
    expect(policy.canSelectShop(staff), isFalse);
    expect(policy.isAllowed(staff, 'shop-a'), isTrue);
    expect(policy.isAllowed(staff, 'shop-b'), isFalse);
  });
}
