import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getCachedEntities, listOperations, type OfflineScope } from "./offline-db";
import { queueShopSettingsUpdate } from "./offline-settings";
import { imageUploadMarker } from "./offline-images";
import type { Shop } from "./types";

const scope: OfflineScope = { merchantId: "merchant", membershipId: "membership" };
const shop: Shop = {
  id: "shop",
  name: "Shop",
  code: "SHOP",
  address: { line1: "Old address" },
  is_active: true,
  module_codes: [],
  include_tax: false,
  tax_rate: "0",
  tax_label: "Tax",
  receipt_note: "",
  footer_note: "",
};

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("business-central-portal-offline");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Offline database is blocked."));
  });
}

beforeEach(deleteDatabase);

describe("offline shop settings", () => {
  it("keeps a local logo preview and a durable upload marker for reconnect sync", async () => {
    const upload = {
      id: "logo-upload",
      filename: "shop-logo.png",
      content_type: "image/png",
      data_base64: "aW1hZ2U=",
    };
    const operation = await queueShopSettingsUpdate(
      scope,
      shop,
      {
        name: shop.name,
        code: shop.code,
        address: {
          line1: "New address",
          logo_url: imageUploadMarker(upload.id),
          logo_source_type: "UPLOAD",
        },
        is_active: true,
        include_tax: false,
        tax_rate: "0",
        tax_label: "Tax",
        receipt_note: "",
      },
      { offlineImageUploads: [upload], localLogoUrl: "data:image/png;base64,aW1hZ2U=" },
    );

    await expect(listOperations(scope)).resolves.toMatchObject([
      {
        operationId: operation.operationId,
        entityType: "SHOP_SETTINGS",
        payload: {
          address: { logo_url: imageUploadMarker(upload.id) },
          portal_image_uploads: [upload],
        },
      },
    ]);
    await expect(getCachedEntities<Shop>(scope, "SHOP_SETTINGS")).resolves.toMatchObject([
      {
        entityId: shop.id,
        payload: {
          logo_url: "data:image/png;base64,aW1hZ2U=",
          address: { logo_url: "data:image/png;base64,aW1hZ2U=" },
        },
      },
    ]);
  });

  it("persists operational and printer settings to the offline entity projection and sync payload", async () => {
    const operation = await queueShopSettingsUpdate(
      scope,
      shop,
      {
        name: shop.name,
        code: shop.code,
        address: {
          line1: "Shop address",
          default_view: "/pos",
          currency_display: "SYMBOL",
          default_status: "DIAGNOSING",
          confirmation: "always",
          printer_paper_width_mm: "80",
          printer_font_size_px: "16",
        },
        is_active: true,
        include_tax: true,
        tax_rate: "7",
        tax_label: "VAT",
        receipt_note: "Thank you!",
      },
    );

    await expect(listOperations(scope)).resolves.toMatchObject([
      {
        operationId: operation.operationId,
        entityType: "SHOP_SETTINGS",
        payload: {
          include_tax: true,
          tax_rate: "7",
          tax_label: "VAT",
          receipt_note: "Thank you!",
          address: {
            default_view: "/pos",
            currency_display: "SYMBOL",
            default_status: "DIAGNOSING",
            confirmation: "always",
            printer_paper_width_mm: "80",
            printer_font_size_px: "16",
          },
        },
      },
    ]);

    await expect(getCachedEntities<Shop>(scope, "SHOP_SETTINGS")).resolves.toMatchObject([
      {
        entityId: shop.id,
        payload: {
          include_tax: true,
          tax_rate: "7",
          tax_label: "VAT",
          receipt_note: "Thank you!",
          default_view: "/pos",
          currency_display: "SYMBOL",
          default_status: "DIAGNOSING",
          confirmation: "always",
          address: {
            default_view: "/pos",
            currency_display: "SYMBOL",
            default_status: "DIAGNOSING",
            confirmation: "always",
            printer_paper_width_mm: "80",
            printer_font_size_px: "16",
          },
        },
      },
    ]);
  });
});
