import {
  getCachedEntities,
  listOperations,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineOperationStatus,
  type OfflineScope,
} from "./offline-db";
import type { Delivery, Promotion, Shop, Variant } from "./types";
import { randomUuid } from "./random-uuid";

export const OFFLINE_CHECKOUT_ENTITY = "POS_CHECKOUT";

type CheckoutLineInput = {
  item: Variant & { price?: string; product_name?: string; quantity_on_hand?: string };
  quantity: number;
};

export type CheckoutSnapshot = {
  currency_code: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
};

export type OfflineCheckoutProjection = {
  provisional_id: string;
  shop_id: string;
  saved_at: string;
  status: "PENDING_SYNCHRONIZATION" | "PENDING_PAYMENT_AUTHORIZATION";
  customer_name?: string;
  customer_phone?: string;
  delivery?: { id: string; name: string; contact_info: string };
  note?: string;
  payment: { method: string; status: "PROVISIONAL_CASH" | "PENDING_AUTHORIZATION" };
  snapshot: CheckoutSnapshot;
  line_snapshots: Array<{
    variant_id: string;
    product_id: string;
    product_name: string;
    variant_name: string;
    sku: string;
    barcode?: string;
    unit_id: string;
    quantity: string;
    unit_price: string;
    line_subtotal: string;
    stock_tracked: boolean;
    quantity_on_hand: string;
  }>;
};

export type QueueOfflineCheckoutInput = {
  scope: OfflineScope;
  provisionalId?: string;
  shop: Shop;
  currencyCode: string;
  lines: CheckoutLineInput[];
  promotion?: Promotion;
  manualPromotion?: string;
  customerName?: string;
  customerPhone?: string;
  delivery?: Delivery;
  deliveryFee?: string;
  note?: string;
  paymentMethod: string;
  paymentTypeId?: string;
  paymentCategory?: "CASH" | "ONLINE" | "DIGITAL";
};

function cents(value: string | number | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("Checkout contains an invalid money value.");
  return Math.round(parsed * 100);
}

function money(value: number) {
  return (value / 100).toFixed(2);
}

export function calculateOfflineCheckoutSnapshot(
  input: QueueOfflineCheckoutInput,
): CheckoutSnapshot {
  const subtotal = input.lines.reduce(
    (sum, line) => sum + cents(line.item.price) * line.quantity,
    0,
  );
  if (subtotal <= 0) throw new Error("Add at least one priced item before checkout.");
  let promotionDiscount = 0;
  const promotion = input.promotion;
  if (promotion) {
    const now = Date.now();
    const available =
      promotion.is_active &&
      (!promotion.starts_at || Date.parse(promotion.starts_at) <= now) &&
      (!promotion.ends_at || Date.parse(promotion.ends_at) > now) &&
      (promotion.usage_limit === undefined || promotion.redemption_count < promotion.usage_limit) &&
      subtotal >= cents(promotion.minimum_subtotal);
    if (!available)
      throw new Error("The synchronized promotion is not available for this provisional checkout.");
    promotionDiscount =
      promotion.promotion_type.toUpperCase() === "PERCENTAGE"
        ? Math.round((subtotal * Number(promotion.value)) / 100)
        : Math.min(subtotal, cents(promotion.value));
  }
  const manualDiscount = cents(input.manualPromotion);
  if (promotionDiscount + manualDiscount > subtotal) {
    throw new Error("The provisional discount cannot exceed the subtotal.");
  }
  const taxable = subtotal - promotionDiscount - manualDiscount;
  const tax = input.shop.include_tax
    ? Math.round((taxable * Number(input.shop.tax_rate || 0)) / 100)
    : 0;
  const total = taxable + tax + cents(input.deliveryFee);
  if (total <= 0) throw new Error("The provisional checkout total must be greater than zero.");
  return {
    currency_code: input.currencyCode,
    subtotal: money(subtotal),
    discount_total: money(promotionDiscount + manualDiscount),
    tax_total: money(tax),
    grand_total: money(total),
  };
}

export async function pendingCheckoutQuantities(scope: OfflineScope) {
  const operations = await listOperations(scope);
  const quantities = new Map<string, number>();
  for (const operation of operations) {
    if (
      operation.entityType !== OFFLINE_CHECKOUT_ENTITY ||
      !["PENDING", "SYNCING", "FAILED"].includes(operation.status)
    )
      continue;
    const lines = operation.payload.line_snapshots;
    if (!Array.isArray(lines)) continue;
    for (const raw of lines) {
      const line = raw as { variant_id?: string; quantity?: string };
      if (!line.variant_id) continue;
      quantities.set(
        line.variant_id,
        (quantities.get(line.variant_id) ?? 0) + Number(line.quantity ?? 0),
      );
    }
  }
  return quantities;
}

export async function queueOfflineCheckout(input: QueueOfflineCheckoutInput) {
  if (!input.lines.length) throw new Error("The cart is empty.");
  const reserved = await pendingCheckoutQuantities(input.scope);
  for (const line of input.lines) {
    if (!line.item.is_stock_tracked) continue;
    const remaining = Number(line.item.quantity_on_hand ?? 0) - (reserved.get(line.item.id) ?? 0);
    if (line.quantity > remaining) {
      throw new Error(
        `${line.item.name} has only ${Math.max(0, remaining)} provisionally available.`,
      );
    }
  }
  const provisionalId = input.provisionalId ?? randomUuid();
  const savedAt = new Date().toISOString();
  const snapshot = calculateOfflineCheckoutSnapshot(input);
  const method = input.paymentMethod;
  const category = input.paymentCategory ?? (method.toUpperCase() === "CASH" ? "CASH" : "ONLINE");
  const lineSnapshots: OfflineCheckoutProjection["line_snapshots"] = input.lines.map(
    ({ item, quantity }) => ({
      variant_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name ?? "Product",
      variant_name: item.name,
      sku: item.sku,
      ...(item.barcode ? { barcode: item.barcode } : {}),
      unit_id: item.base_unit_id,
      quantity: String(quantity),
      unit_price: Number(item.price ?? 0).toFixed(2),
      line_subtotal: money(cents(item.price) * quantity),
      stock_tracked: item.is_stock_tracked,
      quantity_on_hand: String(item.quantity_on_hand ?? "0"),
    }),
  );
  const projection: OfflineCheckoutProjection = {
    provisional_id: provisionalId,
    shop_id: input.shop.id,
    saved_at: savedAt,
    status: category === "CASH" ? "PENDING_SYNCHRONIZATION" : "PENDING_PAYMENT_AUTHORIZATION",
    ...(input.customerName ? { customer_name: input.customerName } : {}),
    ...(input.customerPhone ? { customer_phone: input.customerPhone } : {}),
    ...(input.delivery
      ? {
          delivery: {
            id: input.delivery.id,
            name: input.delivery.name,
            contact_info: input.delivery.contact_info,
          },
        }
      : {}),
    ...(input.note ? { note: input.note } : {}),
    payment: {
      method,
      status: category === "CASH" ? "PROVISIONAL_CASH" : "PENDING_AUTHORIZATION",
    },
    snapshot,
    line_snapshots: lineSnapshots,
  };
  const payload = {
    shop_id: input.shop.id,
    request: {
      shop_id: input.shop.id,
      lines: lineSnapshots.map((line) => ({
        variant_id: line.variant_id,
        quantity: line.quantity,
      })),
      ...(input.promotion ? { promotion_id: input.promotion.id } : {}),
      ...(input.customerName ? { customer_name: input.customerName } : {}),
      ...(input.customerPhone ? { customer_phone: input.customerPhone } : {}),
      ...(input.delivery ? { delivery_id: input.delivery.id } : {}),
      delivery_fee: input.deliveryFee || "0",
      manual_promotion: input.manualPromotion || "0",
      ...(input.note ? { note: input.note } : {}),
      payment_method: method,
      ...(input.paymentTypeId ? { payment_type_id: input.paymentTypeId } : {}),
      idempotency_key: provisionalId,
    },
    snapshot,
    line_snapshots: lineSnapshots,
    inventory_snapshots: lineSnapshots
      .filter((line) => line.stock_tracked)
      .map((line) => ({
        variant_id: line.variant_id,
        quantity_on_hand: line.quantity_on_hand,
        provisional_quantity: line.quantity,
      })),
  };
  const operation = await queueOperationWithEntity(
    input.scope,
    {
      shopId: input.shop.id,
      operationId: provisionalId,
      entityType: OFFLINE_CHECKOUT_ENTITY,
      entityId: provisionalId,
      operationType: "CREATE",
      payload,
    },
    projection,
  );
  requestBackgroundSync();
  return { operation, projection };
}

export async function listOfflineCheckouts(scope: OfflineScope) {
  const [entities, operations] = await Promise.all([
    getCachedEntities<Record<string, unknown>>(scope, OFFLINE_CHECKOUT_ENTITY),
    listOperations(scope),
  ]);
  const operationByEntity = new Map(
    operations
      .filter((operation) => operation.entityType === OFFLINE_CHECKOUT_ENTITY)
      .map((operation) => [operation.entityId, operation]),
  );
  return entities
    .map((entity) => {
      const operation = operationByEntity.get(entity.entityId);
      return {
        entityId: entity.entityId,
        payload: entity.payload,
        operationStatus: (operation?.status ?? "SYNCED") as OfflineOperationStatus,
        lastError: operation?.lastError,
        serverPayload: operation?.serverPayload,
        cachedAt: entity.cachedAt,
      };
    })
    .sort((left, right) => right.cachedAt.localeCompare(left.cachedAt));
}
