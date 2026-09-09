"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { Badge, Button, EmptyState, Field, Loading, Modal, StatusBadge } from "./ui";
import { InvoiceReceipt } from "./invoice-receipt";
import { formatShopAddress } from "@/lib/shop-address";
import { api, NetworkUnavailableError, post } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useShop } from "@/lib/shop";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import {
  listOfflineCheckouts,
  pendingCheckoutQuantities,
  queueOfflineCheckout,
  calculateOfflineCheckoutSnapshot,
  type OfflineCheckoutProjection,
} from "@/lib/offline-checkout";
import { currencyLabel, formatMoney } from "@/lib/currency";
import type { Delivery, Invoice, PaymentType, Promotion, Variant } from "@/lib/types";
import { getMetadata, putMetadata } from "@/lib/offline-db";
import { BarcodeScanner } from "./barcode-scanner";
import { randomUuid } from "@/lib/random-uuid";
import { lookupBarcodeOffline } from "@/lib/offline-barcode";

type SaleItem = Variant & {
  price?: string;
  product_name?: string;
  quantity_on_hand?: string;
  stock_asset_id?: string;
  barcode_match?: string;
};
type CartItem = { item: SaleItem; quantity: number };
type SaleQuote = {
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  currency_code: string;
};

export function PosPage() {
  const router = useRouter();
  const { currentShop } = useShop();
  const { merchant } = useAuth();
  const simple = merchant?.pos_complexity_level === "SIMPLE";
  const offline = useOffline();
  const catalog = useResource<SaleItem>(
    `/pos/catalog?page_index=0&page_size=200${currentShop ? `&shop_id=${encodeURIComponent(currentShop.id)}` : ""}`,
  );
  const promotions = useResource<Promotion>(
    "/promotions?page_index=0&page_size=100&filter=is_active:true",
  );
  const paymentTypes = useResource<PaymentType>("/payment-types?active_only=true");
  const [query, setQuery] = useState("");
  const [barcodeMatches, setBarcodeMatches] = useState<SaleItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState(false);
  const [promotionId, setPromotionId] = useState("");
  const [quote, setQuote] = useState<SaleQuote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [manualPromotion, setManualPromotion] = useState("0");
  const [note, setNote] = useState("");
  const [paymentType, setPaymentType] = useState("CASH");
  const [reserved, setReserved] = useState(new Map<string, number>());
  const [savedCheckouts, setSavedCheckouts] = useState<
    Awaited<ReturnType<typeof listOfflineCheckouts>>
  >([]);
  const [provisionalReceipt, setProvisionalReceipt] = useState<OfflineCheckoutProjection | null>(
    null,
  );
  const restoredDraftFor = useRef<string | null>(null);
  const deliveryResource = useResource<Delivery>(
    currentShop ? `/shops/${currentShop.id}/deliveries?page_index=0&page_size=100` : "",
  );
  const deliveries = deliveryResource.data;
  const usablePaymentTypes = paymentTypes.data.filter((item) => item.category_code !== "DIGITAL");
  const selectedPaymentType =
    usablePaymentTypes.find((item) => item.id === paymentType) ??
    usablePaymentTypes.find((item) => item.category_code === "CASH") ??
    usablePaymentTypes[0];
  const selectedPaymentTypeId = selectedPaymentType?.id ?? "";

  const hasDelivery = Boolean(deliveryId);
  const hasPromotion = Boolean(promotionId || Number(manualPromotion) > 0);
  const hasCustomer = Boolean(customerName.trim() || customerPhone.trim());
  const hasNote = Boolean(note.trim());
  const detailsCount =
    (hasCustomer ? 1 : 0) + (hasDelivery ? 1 : 0) + (hasPromotion ? 1 : 0) + (hasNote ? 1 : 0);

  useEffect(() => {
    if (!offline.scope || !currentShop) return;
    const shopID = currentShop.id;
    let active = true;
    restoredDraftFor.current = null;
    void getMetadata<{
      cart?: CartItem[];
      customerName?: string;
      customerPhone?: string;
      deliveryId?: string;
      deliveryFee?: string;
      manualPromotion?: string;
      note?: string;
      paymentType?: string;
      promotionId?: string;
    }>(offline.scope, `pos-draft:${shopID}`)
      .then((draft) => {
        if (!active || restoredDraftFor.current !== null) return;
        setCart(draft?.cart ?? []);
        setCustomerName(draft?.customerName ?? "");
        setCustomerPhone(draft?.customerPhone ?? "");
        setDeliveryId(draft?.deliveryId ?? "");
        setDeliveryFee(draft?.deliveryFee ?? "0");
        setManualPromotion(draft?.manualPromotion ?? "0");
        setNote(draft?.note ?? "");
        setPaymentType(draft?.paymentType ?? "CASH");
        setPromotionId(draft?.promotionId ?? "");
        setQuote(null);
        restoredDraftFor.current = shopID;
      })
      .catch(() => {
        if (active) restoredDraftFor.current = shopID;
      });
    return () => {
      active = false;
    };
  }, [currentShop, offline.scope]);

  useEffect(() => {
    if (!offline.scope || !currentShop || restoredDraftFor.current !== currentShop.id) return;
    void putMetadata(offline.scope, `pos-draft:${currentShop.id}`, {
      cart,
      customerName,
      customerPhone,
      deliveryId,
      deliveryFee,
      manualPromotion,
      note,
      paymentType,
      promotionId,
    }).catch(() => undefined);
  }, [
    cart,
    currentShop,
    customerName,
    customerPhone,
    deliveryFee,
    deliveryId,
    manualPromotion,
    note,
    offline.scope,
    paymentType,
    promotionId,
  ]);
  const visible = catalog.data.filter((item) =>
    `${item.name} ${item.product_name ?? ""} ${item.sku} ${item.barcode ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const subtotal = cart.reduce((sum, row) => sum + Number(row.item.price ?? 0) * row.quantity, 0);
  const promotion = promotions.data.find((item) => item.id === promotionId);
  const currencyCode = quote?.currency_code ?? merchant?.default_currency_code;
  const refreshOfflineCheckouts = useCallback(async () => {
    if (!offline.scope) return;
    const [nextReserved, nextCheckouts] = await Promise.all([
      pendingCheckoutQuantities(offline.scope),
      listOfflineCheckouts(offline.scope),
    ]);
    setReserved(nextReserved);
    setSavedCheckouts(nextCheckouts);
  }, [offline.scope]);
  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshOfflineCheckouts(), 0);
    window.addEventListener("bc-offline-data-changed", refreshOfflineCheckouts);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("bc-offline-data-changed", refreshOfflineCheckouts);
    };
  }, [refreshOfflineCheckouts]);
  const availableQuantity = (item: SaleItem) =>
    Math.max(0, Number(item.quantity_on_hand ?? 0) - (reserved.get(item.id) ?? 0));
  const quantityInCart = (item: SaleItem) =>
    cart.find((row) => row.item.id === item.id && row.item.stock_asset_id === item.stock_asset_id)
      ?.quantity ?? 0;
  function add(item: SaleItem) {
    setQuote(null);
    setError("");
    setCart((current) => {
      const found = current.find(
        (row) => row.item.id === item.id && row.item.stock_asset_id === item.stock_asset_id,
      );
      return found
        ? current.map((row) =>
            row.item.id === item.id && row.item.stock_asset_id === item.stock_asset_id
              ? { ...row, quantity: row.quantity + 1 }
              : row,
          )
        : [...current, { item, quantity: 1 }];
    });
  }
  async function lookupBarcode(code: string) {
    const barcode = code.trim();
    if (!barcode || !currentShop) return;
    setError("");

    if (!navigator.onLine || offline.status === "offline") {
      const matches = await lookupBarcodeOffline(
        offline.scope,
        currentShop.id,
        barcode,
        catalog.data,
      );
      if (matches.length > 1) {
        setBarcodeMatches(matches);
        return;
      }
      const item = matches[0];
      if (!item) {
        setError(`No product or stock item matches barcode ${barcode}.`);
        return;
      }
      add(item);
      setQuery("");
      return;
    }

    try {
      const matches = await api<SaleItem[]>(
        `/pos/barcode-lookup?barcode=${encodeURIComponent(barcode)}&shop_id=${encodeURIComponent(currentShop.id)}`,
      );
      if (matches.length > 1) {
        setBarcodeMatches(matches);
        return;
      }
      const item = matches[0];
      if (!item) {
        setError(`No product or stock item matches barcode ${barcode}.`);
        return;
      }
      add(item);
      setQuery("");
    } catch (reason) {
      if (reason instanceof NetworkUnavailableError || !navigator.onLine) {
        const matches = await lookupBarcodeOffline(
          offline.scope,
          currentShop.id,
          barcode,
          catalog.data,
        );
        if (matches.length > 1) {
          setBarcodeMatches(matches);
          return;
        }
        const item = matches[0];
        if (!item) {
          setError(`No product or stock item matches barcode ${barcode}.`);
          return;
        }
        add(item);
        setQuery("");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Barcode lookup failed.");
    }
  }

  const lookupBarcodeRef = useRef(lookupBarcode);
  useEffect(() => {
    lookupBarcodeRef.current = lookupBarcode;
  });

  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      const isInputOrTextarea =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (isInputOrTextarea) {
        buffer = "";
        return;
      }

      const now = performance.now();

      if (event.key === "Enter") {
        if (buffer.length >= 2 && now - lastKeyTime < 600) {
          event.preventDefault();
          event.stopPropagation();
          const scanned = buffer.trim();
          buffer = "";
          if (scanned) {
            void lookupBarcodeRef.current(scanned);
          }
        } else {
          buffer = "";
        }
        return;
      }

      if (event.key.length === 1) {
        if (buffer.length > 0 && now - lastKeyTime > 120) {
          buffer = "";
        }
        buffer += event.key;
        lastKeyTime = now;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  function changeQuantity(id: string, change: number, assetID?: string) {
    setQuote(null);
    setError("");
    setCart((current) =>
      current
        .map((row) =>
          row.item.id === id && row.item.stock_asset_id === assetID
            ? { ...row, quantity: row.quantity + change }
            : row,
        )
        .filter((row) => row.quantity > 0),
    );
  }
  async function requestQuote(nextPromotionId = promotionId) {
    if (!currentShop) throw new Error("Select an active shop before checkout.");
    if (!cart.length || subtotal <= 0)
      throw new Error("Add at least one priced item before checkout.");
    if (!navigator.onLine || offline.status === "offline") {
      const snapshot = calculateOfflineCheckoutSnapshot({
        scope: offline.scope ?? { merchantId: "preview", membershipId: "preview" },
        shop: currentShop,
        currencyCode: merchant?.default_currency_code ?? "USD",
        lines: cart,
        promotion: promotions.data.find((item) => item.id === nextPromotionId),
        manualPromotion,
        delivery: deliveries.find((item) => item.id === deliveryId),
        deliveryFee,
        customerName,
        customerPhone,
        note,
        paymentMethod: selectedPaymentType?.name ?? "Cash",
        paymentTypeId: selectedPaymentType?.id,
        paymentCategory: selectedPaymentType?.category_code ?? "CASH",
      });
      return snapshot;
    }
    return post<SaleQuote>("/pos/quote", {
      shop_id: currentShop.id,
      lines: cart.map((row) => ({
        variant_id: row.item.id,
        quantity: String(row.quantity),
        asset_id: row.item.stock_asset_id,
      })),
      promotion_id: nextPromotionId || undefined,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      delivery_id: deliveryId || undefined,
      delivery_fee: deliveryFee || undefined,
      manual_promotion: manualPromotion || undefined,
      note: note || undefined,
      payment_type_id: selectedPaymentType?.id,
      payment_method: selectedPaymentType?.name,
    });
  }

  async function applyPromotion(nextPromotionId: string) {
    setPromotionId(nextPromotionId);
    setQuote(null);
    setError("");
    if (!nextPromotionId || !cart.length || subtotal <= 0) return;
    setBusy(true);
    try {
      setQuote(await requestQuote(nextPromotionId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The promotion could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  async function previewInvoice() {
    setBusy(true);
    setError("");
    try {
      setQuote(await requestQuote());
      setInvoicePreview(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The invoice preview could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openCheckout() {
    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine || offline.status === "offline") {
        await saveOfflineCheckout();
        return;
      }
      const nextQuote = await requestQuote();
      setQuote(nextQuote);
      await pay(selectedPaymentTypeId, nextQuote);
    } catch (reason) {
      if (reason instanceof NetworkUnavailableError) {
        try {
          await saveOfflineCheckout();
          return;
        } catch (offlineReason) {
          setError(
            offlineReason instanceof Error
              ? offlineReason.message
              : "The provisional checkout could not be saved.",
          );
          return;
        }
      }
      setError(
        reason instanceof Error ? reason.message : "The order could not be prepared for checkout.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveOfflineCheckout(method = selectedPaymentTypeId, provisionalId?: string) {
    if (!currentShop || !offline.scope)
      throw new Error("An authenticated shop scope is required for offline checkout.");
    const delivery = deliveries.find((item) => item.id === deliveryId);
    const { projection } = await queueOfflineCheckout({
      scope: offline.scope,
      provisionalId,
      shop: currentShop,
      currencyCode: merchant?.default_currency_code ?? "USD",
      lines: cart,
      promotion,
      manualPromotion,
      customerName,
      customerPhone,
      delivery,
      deliveryFee,
      note,
      paymentMethod: usablePaymentTypes.find((item) => item.id === method)?.name ?? "Cash",
      paymentTypeId: method,
      paymentCategory:
        usablePaymentTypes.find((item) => item.id === method)?.category_code ?? "CASH",
    });
    setProvisionalReceipt(projection);
    setCart([]);
    setPromotionId("");
    setQuote(null);
    setInvoicePreview(false);
    await Promise.all([offline.refresh(), refreshOfflineCheckouts()]);
  }
  async function pay(method: string, confirmedQuote: SaleQuote | null = quote) {
    setBusy(true);
    setError("");
    const checkoutId = randomUuid();
    try {
      if (!currentShop || !confirmedQuote)
        throw new Error("Confirm the checkout total before charging.");
      const result = await post<{ id: string }>("/pos/orders", {
        shop_id: currentShop.id,
        lines: cart.map((row) => ({
          variant_id: row.item.id,
          quantity: String(row.quantity),
          asset_id: row.item.stock_asset_id,
        })),
        promotion_id: promotionId || undefined,
        payment_type_id: method,
        payment_method: usablePaymentTypes.find((item) => item.id === method)?.name,
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        delivery_id: deliveryId || undefined,
        delivery_fee: deliveryFee || undefined,
        manual_promotion: manualPromotion || undefined,
        note: note || undefined,
        idempotency_key: checkoutId,
      });
      setCart([]);
      setPromotionId("");
      setQuote(null);
      setInvoicePreview(false);
      router.push(`/invoices?invoice=${result.id}`);
    } catch (reason) {
      if (reason instanceof NetworkUnavailableError) {
        await saveOfflineCheckout(method, checkoutId);
        return;
      }
      setError(reason instanceof Error ? reason.message : "Checkout could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const invoiceDraft: Invoice = {
    id: "preview",
    number: "PREVIEW",
    customer: customerName || "Walk-in customer",
    customerPhone,
    currencyCode: currencyCode ?? "USD",
    shopName: currentShop?.name,
    shopTimezone: currentShop?.timezone,
    logoUrl: currentShop?.logo_url,
    showLogo: currentShop?.show_logo_in_printed_invoice !== false,
    showDeviceCompletionStatus: currentShop?.show_device_completion_status === true,
    shopAddress: formatShopAddress(currentShop?.address),
    shopContact: currentShop?.contact_info,
    deliveryName: deliveries.find((item) => item.id === deliveryId)?.name,
    deliveryContact: deliveries.find((item) => item.id === deliveryId)?.contact_info,
    deliveryFee: Number(deliveryFee || 0),
    note,
    paymentType: selectedPaymentType?.name ?? "Cash",
    footerNote:
      currentShop?.footer_note ||
      (typeof window !== "undefined" && currentShop
        ? (localStorage.getItem(`bc.printer.footerNote.${currentShop.id}`) ?? "")
        : ""),
    receiptNote: currentShop?.receipt_note,
    taxLabel: currentShop?.tax_label,
    createdAt: new Date().toISOString(),
    status: "Pending",
    subtotal: Number(quote?.subtotal ?? subtotal),
    discount: Number(quote?.discount_total ?? 0),
    tax: Number(quote?.tax_total ?? 0),
    total: Number(quote?.grand_total ?? subtotal),
    items: cart.map((row) => ({
      name: simple ? (row.item.product_name ?? row.item.name) : row.item.name,
      quantity: row.quantity,
      price: Number(row.item.price ?? 0),
    })),
  };

  return (
    <div className="pos-page flex flex-col lg:flex-row gap-6 items-start">
      <Modal
        open={barcodeMatches.length > 1}
        title="Choose a matching variant"
        description="This barcode belongs to more than one sellable variant."
        onClose={() => setBarcodeMatches([])}
      >
        <div className="modal-list space-y-2">
          {barcodeMatches.map((item) => (
            <button
              type="button"
              className="stock-product-row w-full flex items-center gap-3 p-3 rounded-xl border border-line bg-paper hover:bg-canvas transition text-left cursor-pointer"
              key={`${item.id}-${item.stock_asset_id ?? "variant"}`}
              onClick={() => {
                add(item);
                setBarcodeMatches([]);
                setQuery("");
              }}
            >
              <span className="stock-product-icon flex items-center justify-center w-9 h-9 rounded-lg bg-canvas text-ink border border-line shrink-0">
                <Icon name="box" size={18} />
              </span>
              <span className="stock-product-name flex-1 min-w-0">
                <strong className="block text-xs font-bold text-ink truncate">
                  {item.product_name ?? "Product"}
                </strong>
                <small className="block text-[11px] text-muted truncate">
                  {item.name} · SKU {item.sku}
                </small>
              </span>
              <span className="stock-product-balance font-bold text-xs text-ink">
                <strong>{formatMoney(item.price, currencyCode)}</strong>
              </span>
            </button>
          ))}
        </div>
      </Modal>
      <section className="pos-catalog flex-1 min-w-0 w-full space-y-4">
        <header className="pos-header flex items-center justify-between gap-4 pb-3 border-b border-line">
          <div>
            <p className="eyebrow text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">
              Point of sale
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-ink m-0">New sale</h1>
          </div>
          <Badge tone={currentShop ? "success" : "warning"}>
            {currentShop?.name ?? "Select a shop"}
          </Badge>
        </header>
        <BarcodeScanner
          value={query}
          onChange={setQuery}
          onScan={(code) => void lookupBarcode(code)}
          placeholder="Search or scan barcode"
        />
        <div className="pos-search legacy-search hidden">
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              simple ? "Search products or scan barcode…" : "Search products, SKU or scan barcode…"
            }
            autoFocus
          />
        </div>
        {catalog.loading ? (
          <div className="p-8 flex justify-center">
            <Loading />
          </div>
        ) : catalog.error ? (
          <EmptyState title="Catalog unavailable" message={catalog.error} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No matching products"
            message="Try another search or add products to the catalog."
          />
        ) : (
          <div className="product-grid grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {visible.map((item) => {
              const displayName = simple ? (item.product_name ?? item.name) : item.name;
              const quantity = quantityInCart(item);
              const atStockLimit = item.is_stock_tracked && quantity >= availableQuantity(item);
              return (
                <article
                  className="product-tile flex flex-col justify-between p-3 rounded-xl border border-line bg-paper hover:border-ink/40 transition shadow-xs text-left"
                  key={`${item.id}:${item.stock_asset_id ?? ""}`}
                >
                  <button
                    type="button"
                    className="product-tile-main flex-1 flex flex-col gap-2 text-left cursor-pointer w-full"
                    aria-label={`Add ${displayName} to cart`}
                    disabled={item.is_stock_tracked && availableQuantity(item) <= 0}
                    onClick={() => add(item)}
                  >
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-canvas text-ink border border-line">
                      <Icon name="box" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {!simple && (
                        <small className="block text-[10px] text-muted truncate">
                          {item.product_name ?? "Product"}
                        </small>
                      )}
                      <strong className="block text-xs font-bold text-ink truncate mt-0.5">
                        {displayName}
                      </strong>
                      <p className="product-tile-stock text-[10px] text-muted m-0 mt-1 truncate">
                        {!simple && <>{item.sku} · </>}
                        {availableQuantity(item).toLocaleString()} available stock
                      </p>
                    </div>
                    <b className="text-xs font-bold text-ink mt-2">
                      {formatMoney(item.price, currencyCode)}
                    </b>
                  </button>
                  <div className="mobile-product-quantity flex items-center justify-between mt-3 pt-2 border-t border-line text-xs font-semibold">
                    <button
                      type="button"
                      aria-label={`Decrease ${displayName} quantity`}
                      disabled={quantity === 0}
                      onClick={() => changeQuantity(item.id, -1, item.stock_asset_id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-line bg-canvas hover:bg-paper disabled:opacity-40 cursor-pointer"
                    >
                      −
                    </button>
                    <output
                      aria-label={`${displayName} quantity in cart`}
                      className="text-xs font-bold text-ink"
                    >
                      {quantity}
                    </output>
                    <button
                      type="button"
                      aria-label={`Increase ${displayName} quantity`}
                      disabled={atStockLimit}
                      onClick={() => add(item)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-line bg-canvas hover:bg-paper disabled:opacity-40 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <aside
        className={`cart-panel w-full lg:w-96 rounded-2xl border border-line bg-paper shadow-portal lg:sticky lg:top-20 p-4 space-y-4 shrink-0 ${
          mobileCartOpen ? "mobile-open" : ""
        }`}
      >
        <button
          type="button"
          className="mobile-cart-toggle lg:hidden w-full flex items-center justify-between p-3 rounded-xl bg-canvas border border-line text-left cursor-pointer"
          aria-expanded={mobileCartOpen}
          aria-controls="current-order-panel"
          onClick={() => setMobileCartOpen((open) => !open)}
        >
          <span className="mobile-cart-toggle-icon flex items-center justify-center w-8 h-8 rounded-lg bg-paper text-ink border border-line">
            <Icon name={mobileCartOpen ? "close" : "cart"} size={18} />
          </span>
          <span className="flex-1 min-w-0 ml-3">
            <strong className="block text-xs font-bold text-ink truncate">
              {mobileCartOpen ? "Close current order" : "View current order"}
            </strong>
            <small className="block text-[10px] text-muted">
              {cart.reduce((sum, row) => sum + row.quantity, 0)} items
            </small>
          </span>
          <b className="text-xs font-bold text-ink">
            {formatMoney(quote?.grand_total ?? subtotal, currencyCode)}
          </b>
        </button>
        <div id="current-order-panel" className="cart-panel-content space-y-4">
          <div className="cart-head flex items-start justify-between gap-3 pb-3 border-b border-line">
            <div>
              <p className="eyebrow text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">
                Sale details
              </p>
              <h2 className="text-base font-bold text-ink m-0">Current order</h2>
            </div>
            <div className="cart-head-meta flex items-center gap-2 text-xs text-muted">
              <span>{cart.reduce((sum, row) => sum + row.quantity, 0)} items</span>
              {cart.length > 0 && (
                <button
                  className="text-[11px] text-status-danger hover:underline cursor-pointer"
                  onClick={() => {
                    setCart([]);
                    setQuote(null);
                    setPromotionId("");
                    setError("");
                  }}
                >
                  Clear order
                </button>
              )}
            </div>
          </div>
          <div className="cart-lines space-y-2.5 max-h-80 overflow-y-auto">
            {cart.length === 0 ? (
              <EmptyState
                icon="cart"
                title="Cart is empty"
                message="Tap a product to add it to this sale."
              />
            ) : (
              cart.map((row) => (
                <div
                  className="cart-line flex items-center gap-3 p-2.5 rounded-xl bg-canvas border border-line text-xs"
                  key={row.item.id}
                >
                  <span className="cart-product flex items-center justify-center w-8 h-8 rounded-lg bg-paper text-ink border border-line shrink-0">
                    <Icon name="box" size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <strong className="block text-xs font-bold text-ink truncate">
                      {simple ? (row.item.product_name ?? row.item.name) : row.item.name}
                    </strong>
                    <small className="block text-[10px] text-muted">
                      {formatMoney(row.item.price, currencyCode)}
                    </small>
                    <div className="qty flex items-center gap-2 mt-1">
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded bg-paper border border-line text-xs hover:bg-canvas cursor-pointer"
                        onClick={() => changeQuantity(row.item.id, -1, row.item.stock_asset_id)}
                      >
                        −
                      </button>
                      <span className="text-xs font-semibold text-ink">{row.quantity}</span>
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded bg-paper border border-line text-xs hover:bg-canvas disabled:opacity-40 cursor-pointer"
                        disabled={
                          row.item.is_stock_tracked && row.quantity >= availableQuantity(row.item)
                        }
                        onClick={() => changeQuantity(row.item.id, 1, row.item.stock_asset_id)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="cart-line-total text-right shrink-0">
                    <b className="block text-xs font-bold text-ink">
                      {formatMoney(Number(row.item.price ?? 0) * row.quantity, currencyCode)}
                    </b>
                    <small className="block text-[10px] text-muted">{row.quantity} × item</small>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="cart-totals space-y-2 pt-3 border-t border-line text-xs">
            <div className="cart-actions grid grid-cols-2 gap-2 mb-3">
              <Button
                variant="secondary"
                icon="users"
                disabled={busy || !currentShop}
                onClick={() => setDetailsOpen(true)}
                className={
                  detailsCount > 0 ? "border-ink/40 bg-surface-muted/70 font-medium text-ink" : ""
                }
              >
                <span className="flex items-center gap-1.5">
                  <span>{detailsCount > 0 ? `Details (${detailsCount})` : "Add detail"}</span>
                  {detailsCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue" />}
                </span>
              </Button>
              <Button
                variant="secondary"
                icon="receipt"
                disabled={!cart.length || busy || !currentShop}
                onClick={previewInvoice}
              >
                Preview
              </Button>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>Catalog subtotal</span>
              <strong className="text-ink font-semibold">
                {formatMoney(subtotal, currencyCode)}
              </strong>
            </div>
            {quote && Number(quote.discount_total) > 0 && (
              <div className="discount flex items-center justify-between text-status-success font-semibold">
                <span>{promotion?.name ?? "Promotion"} discount</span>
                <strong>−{formatMoney(quote.discount_total, currencyCode)}</strong>
              </div>
            )}
            <div className="grand-total flex items-center justify-between font-bold text-base text-ink pt-2 border-t border-line">
              <span>Order total</span>
              <strong>{formatMoney(quote?.grand_total ?? subtotal, currencyCode)}</strong>
            </div>
            {error && (
              <div className="form-error flex items-center gap-2 p-2 rounded-lg text-xs font-medium bg-status-danger-soft text-status-danger border border-status-danger-border">
                {error}
              </div>
            )}
            <Button
              className="w-full h-11 text-sm mt-2"
              disabled={!cart.length || subtotal <= 0 || busy || !currentShop}
              onClick={() => void openCheckout()}
            >
              {busy ? "Preparing…" : "Checkout"}
            </Button>
          </div>
        </div>
      </aside>
      <Modal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Sale details"
        description="Add customer, fulfilment, and promotion details to this sale."
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          {/* Card 1: Customer Information */}
          <div className="order-details-card">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-blue/10 text-blue grid place-items-center shrink-0">
                  <Icon name="user" size={15} />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-ink">
                  Customer
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCustomerName("Walk-in customer")}
                  className="px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-ink rounded-lg bg-surface border border-line hover:border-theme-gray-300 transition cursor-pointer"
                >
                  Walk-in
                </button>
                {(customerName || customerPhone) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerName("");
                      setCustomerPhone("");
                    }}
                    className="px-2 py-1 text-[11px] font-medium text-muted hover:text-status-danger rounded-lg hover:bg-status-danger-soft transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Customer name" hint="Walk-in customer by default" className="mb-0">
                <input
                  type="text"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Walk-in customer"
                />
              </Field>
              <Field label="Customer phone" hint="For receipt or pickup SMS" className="mb-0">
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="Optional phone number"
                />
              </Field>
            </div>
          </div>

          {/* Card 2: Fulfilment & Payment */}
          <div className="order-details-card">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-status-success-soft text-status-success grid place-items-center shrink-0">
                <Icon name="package" size={15} />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-ink">
                Fulfilment & payment
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Delivery carrier"
                hint="Select carrier if delivery is required"
                className="mb-0"
              >
                <select
                  value={deliveryId}
                  onChange={(event) => {
                    const nextDeliveryId = event.target.value;
                    setDeliveryId(nextDeliveryId);
                    if (!nextDeliveryId) {
                      setDeliveryFee("0");
                    }
                  }}
                >
                  <option value="">No delivery (In-store)</option>
                  {deliveries.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              {deliveryId ? (
                <Field
                  label={`Delivery fee (${currencyCode ?? ""})`}
                  hint="Carrier or dispatch fee"
                  className="mb-0"
                >
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-xs font-semibold text-muted pointer-events-none">
                      {currencyCode}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={deliveryFee}
                      onChange={(event) => setDeliveryFee(event.target.value)}
                      placeholder="0.00"
                      className="pl-14"
                    />
                  </div>
                </Field>
              ) : null}
              <Field
                label="Payment type"
                hint="Payment method for this transaction"
                className={deliveryId ? "sm:col-span-2 mb-0" : "mb-0"}
              >
                <select
                  value={selectedPaymentTypeId}
                  onChange={(event) => setPaymentType(event.target.value)}
                >
                  {usablePaymentTypes.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} · {item.category_code}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* Card 3: Promotions & Adjustments */}
          <div className="order-details-card">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-amber/10 text-amber grid place-items-center shrink-0">
                <Icon name="tag" size={15} />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-ink">
                Promotions & notes
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Promotion" hint="Select active shop discount" className="mb-0">
                <select
                  value={promotionId}
                  onChange={(event) => void applyPromotion(event.target.value)}
                >
                  <option value="">No promotion</option>
                  {promotions.data.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`Manual discount (${currencyCode ?? ""})`}
                hint="Direct sale price reduction"
                className="mb-0"
              >
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-semibold text-muted pointer-events-none">
                    −
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualPromotion}
                    onChange={(event) => {
                      setManualPromotion(event.target.value);
                      setQuote(null);
                    }}
                    placeholder="0.00"
                    className="pl-8"
                  />
                </div>
              </Field>
              <Field
                label="Additional note"
                hint="Customer instructions or packaging notes"
                className="sm:col-span-2 mb-0"
              >
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add a note to this order..."
                  rows={2}
                />
              </Field>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-line mt-1">
            {detailsCount > 0 ? (
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setCustomerName("");
                  setCustomerPhone("");
                  setDeliveryId("");
                  setDeliveryFee("0");
                  setManualPromotion("0");
                  setNote("");
                  setPromotionId("");
                  setQuote(null);
                }}
                className="text-xs text-muted hover:text-status-danger justify-center sm:justify-start"
              >
                Clear all details
              </Button>
            ) : (
              <span className="text-xs text-muted hidden sm:inline">No details added</span>
            )}
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button
                variant="secondary"
                type="button"
                className="flex-1 sm:flex-none justify-center min-h-11 sm:min-h-9"
                onClick={() => setDetailsOpen(false)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                type="button"
                className="flex-1 sm:flex-none justify-center min-w-[110px] min-h-11 sm:min-h-9"
                onClick={() => setDetailsOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      <Modal
        open={false}
        onClose={() => undefined}
        title="Take payment"
        description="This amount is confirmed from current prices and promotion rules."
      >
        <div className="payment-total">
          <small>Amount due</small>
          <strong>{formatMoney(quote?.grand_total, currencyCode)}</strong>
        </div>
        {quote && Number(quote.discount_total) > 0 && (
          <div className="notice">
            {promotion?.name}: <strong>−{formatMoney(quote.discount_total, currencyCode)}</strong>
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="payment-methods">
          <button disabled={busy || !quote} onClick={() => pay(selectedPaymentTypeId)}>
            <span>{currencyLabel(currencyCode)}</span>
            <strong>Cash</strong>
            <small>Record a cash payment</small>
          </button>
          <button
            disabled={busy || !quote}
            onClick={() => {
              setPaymentType("CARD");
              void pay("CARD");
            }}
          >
            <span>□</span>
            <strong>Card</strong>
            <small>External card terminal</small>
          </button>
          <button
            disabled={busy || !quote}
            onClick={() => {
              setPaymentType("QR");
              void pay("QR");
            }}
          >
            <span>⌗</span>
            <strong>QR payment</strong>
            <small>Scan-to-pay transfer</small>
          </button>
        </div>
      </Modal>
      <Modal
        open={invoicePreview}
        onClose={() => setInvoicePreview(false)}
        title="Invoice preview"
        description="This is how the invoice will appear after checkout."
      >
        <div className="invoice-preview-body">
          <InvoiceReceipt invoice={invoiceDraft} />
        </div>
      </Modal>
      <Modal
        open={Boolean(provisionalReceipt)}
        onClose={() => setProvisionalReceipt(null)}
        title="Provisional offline receipt"
        description="Saved durably on this device. It is not a canonical invoice and remains pending synchronization."
      >
        {provisionalReceipt && (
          <div className="invoice-preview-body">
            <InvoiceReceipt
              invoice={{
                id: provisionalReceipt.provisional_id,
                number: "PENDING SYNCHRONIZATION",
                customer: provisionalReceipt.customer_name || "Walk-in customer",
                customerPhone: provisionalReceipt.customer_phone,
                currencyCode: provisionalReceipt.snapshot.currency_code,
                shopName: currentShop?.name,
                logoUrl: currentShop?.logo_url,
                showLogo: currentShop?.show_logo_in_printed_invoice !== false,
                showDeviceCompletionStatus: currentShop?.show_device_completion_status === true,
                shopTimezone: currentShop?.timezone,
                deliveryName: provisionalReceipt.delivery?.name,
                deliveryContact: provisionalReceipt.delivery?.contact_info,
                note: provisionalReceipt.note,
                paymentType: `${provisionalReceipt.payment.method} · ${provisionalReceipt.payment.status.replaceAll("_", " ")}`,
                createdAt: provisionalReceipt.saved_at,
                status: "Pending",
                subtotal: Number(provisionalReceipt.snapshot.subtotal),
                discount: Number(provisionalReceipt.snapshot.discount_total),
                tax: Number(provisionalReceipt.snapshot.tax_total),
                total: Number(provisionalReceipt.snapshot.grand_total),
                items: provisionalReceipt.line_snapshots.map((line) => ({
                  name: simple ? line.product_name : `${line.product_name} · ${line.variant_name}`,
                  quantity: Number(line.quantity),
                  price: Number(line.unit_price),
                })),
              }}
            />
          </div>
        )}
      </Modal>
      {savedCheckouts.length > 0 && (
        <section className="panel provisional-checkouts">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">This device</p>
              <h2>Offline checkouts</h2>
            </div>
            <Badge
              tone={
                savedCheckouts.some(
                  (item) =>
                    item.operationStatus === "REJECTED" || item.operationStatus === "CONFLICT",
                )
                  ? "warning"
                  : "neutral"
              }
            >
              {savedCheckouts.length} saved
            </Badge>
          </div>
          {savedCheckouts.map((item) => (
            <article className="sync-operation-list" key={item.entityId}>
              <button
                className="row-action"
                onClick={() => {
                  const payload = item.payload as unknown as OfflineCheckoutProjection;
                  if (payload.line_snapshots) setProvisionalReceipt(payload);
                }}
              >
                <strong>{item.entityId.slice(0, 8)}</strong> ·{" "}
                <StatusBadge status={item.operationStatus} />
              </button>
              {item.lastError && <small className="sync-status-error">{item.lastError}</small>}
              {Boolean(item.serverPayload?.review_required) && (
                <small>
                  Server totals differ. Review the authoritative quote in the synchronization panel
                  before taking corrective action.
                </small>
              )}
              {(() => {
                const canonical = (item.payload.canonical_order ?? null) as {
                  id?: string;
                  order_number?: string;
                } | null;
                return canonical?.id ? (
                  <button
                    className="button button-secondary"
                    onClick={() => router.push(`/invoices?invoice=${canonical.id}`)}
                  >
                    Open {canonical.order_number ?? "canonical invoice"}
                  </button>
                ) : null;
              })()}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
