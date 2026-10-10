import { callNativeDatabase, usingFullyOfflineNativeDatabase } from "./native-database";
import type { Shop } from "./types";
import { isIndexedDbAvailable, putCachedEntity, type OfflineScope } from "./offline-db";

export async function saveNativeDeliveryPreference(
  scope: OfflineScope,
  shop: Shop,
  enabled: boolean,
) {
  await callNativeDatabase("saveSetting", {
    key: nativeDeliverySettingKey(scope.merchantId, shop.id),
    value: String(enabled),
  });
  if (isIndexedDbAvailable())
    await putCachedEntity(
      scope,
      "SHOP_SETTINGS",
      shop.id,
      { ...shop, delivery_payment_status_auto_complete: enabled },
      shop.sync_version ?? 0,
    );
  window.dispatchEvent(
    new CustomEvent("bc-delivery-preference-changed", {
      detail: { merchantId: scope.merchantId, shopId: shop.id, enabled },
    }),
  );
  window.dispatchEvent(new Event("bc-offline-data-changed"));
}

export function nativeDeliverySettingKey(merchant: string, shop: string) {
  return `shop:${merchant}:${shop}:delivery_payment_status_auto_complete`;
}

export async function applyNativeDeliverySettings(merchant: string, shops: Shop[]) {
  if (!usingFullyOfflineNativeDatabase()) return shops;
  return Promise.all(
    shops.map(async (shop) => {
      const value = await callNativeDatabase<string | null>("getSetting", {
        key: nativeDeliverySettingKey(merchant, shop.id),
      });
      return value === null
        ? shop
        : { ...shop, delivery_payment_status_auto_complete: value === "true" };
    }),
  );
}
