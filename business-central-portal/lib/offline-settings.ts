import {
  getEntityVersion,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";
import { PORTAL_IMAGE_UPLOADS, type OfflineImageUpload } from "./offline-images";
import type { Shop } from "./types";

export type ShopSettingsUpdate = {
  name: string;
  code: string;
  address: Record<string, unknown>;
  timezone?: string;
  is_active: boolean;
  footer_note?: string;
  include_tax: boolean;
  tax_rate: string;
  tax_label: string;
  receipt_note: string;
};

export type QueueShopSettingsOptions = {
  offlineImageUploads?: OfflineImageUpload[];
  localLogoUrl?: string;
};

export async function queueShopSettingsUpdate(
  scope: OfflineScope,
  shop: Shop,
  update: ShopSettingsUpdate,
  options: QueueShopSettingsOptions = {},
) {
  const baseVersion = await getEntityVersion(scope, "SHOP_SETTINGS", shop.id);
  const updateAddress = update.address;
  const logoValue = updateAddress.logo_url;
  const currentLogoUrl = shop.logo_url || shop.address?.logo_url;
  const logoURL =
    options.localLogoUrl ?? (typeof logoValue === "string" ? logoValue : currentLogoUrl);
  const projectedAddress: Record<string, string> = { ...(shop.address ?? {}) };
  for (const [key, value] of Object.entries(updateAddress)) {
    if (typeof value === "string") projectedAddress[key] = value;
  }
  if (options.localLogoUrl) projectedAddress.logo_url = options.localLogoUrl;
  const projection: Shop = {
    ...shop,
    name: update.name,
    code: update.code,
    address: projectedAddress,
    timezone: update.timezone,
    is_active: update.is_active,
    footer_note: update.footer_note,
    include_tax: update.include_tax,
    tax_rate: update.tax_rate,
    tax_label: update.tax_label,
    receipt_note: update.receipt_note,
    logo_url: logoURL,
    logo_source_type:
      typeof updateAddress.logo_source_type === "string"
        ? updateAddress.logo_source_type
        : (shop.logo_source_type ?? shop.address?.logo_source_type),
    contact_info:
      typeof updateAddress.contact_info === "string"
        ? updateAddress.contact_info
        : shop.contact_info,
    show_logo_in_printed_invoice:
      updateAddress.show_logo_in_printed_invoice === undefined
        ? (shop.show_logo_in_printed_invoice ?? true)
        : updateAddress.show_logo_in_printed_invoice !== "false",
    show_device_completion_status: updateAddress.show_device_completion_status === "true",
    show_device_type_in_repair_invoice: updateAddress.show_device_type_in_repair_invoice === "true",
    show_device_brand_in_repair_invoice:
      updateAddress.show_device_brand_in_repair_invoice === "true",
  };
  const payload = options.offlineImageUploads?.length
    ? { ...update, [PORTAL_IMAGE_UPLOADS]: options.offlineImageUploads }
    : update;
  const operation = await queueOperationWithEntity(
    scope,
    {
      shopId: shop.id,
      entityType: "SHOP_SETTINGS",
      entityId: shop.id,
      operationType: "UPDATE",
      payload,
      baseVersion,
    },
    projection,
  );
  requestBackgroundSync();
  return operation;
}
