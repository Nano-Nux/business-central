"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./stock-conversions-page.module.css";
import { VariantManager } from "./product-manager";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import { randomUuid } from "@/lib/random-uuid";
import { useResource } from "@/lib/use-resource";
import { formatQuantity } from "@/lib/currency";
import { shopStockLocation } from "@/lib/shop-stock-location";
import { useShop } from "@/lib/shop";
import type { Location, Product, Variant } from "@/lib/types";
import { Button, EmptyState, Field, Form, Loading, PageHeader } from "./ui";

type StockConversionRule = {
  id: string;
  product_id: string;
  product_name: string;
  source_variant_id: string;
  source_variant_name: string;
  source_sku: string;
  destination_variant_id: string;
  destination_variant_name: string;
  destination_sku: string;
  destination_quantity: number;
  is_active: boolean;
};

type StockConversion = {
  id: string;
  rule_id: string;
  location_id: string;
  source_quantity: number;
  destination_quantity: number;
  applied_at: string;
};

type StockConversionPreview = {
  rule_id: string;
  location_id: string;
  source_quantity: number;
  destination_quantity: number;
  source_before: string;
  source_after: string;
  destination_before: string;
  destination_after: string;
};

function PackSetup({
  product,
  onSaved,
}: {
  product: Product;
  onSaved: (rule: StockConversionRule) => Promise<void>;
}) {
  const offline = useOffline();
  const variants = useResource<Variant>(
    `/catalog/products/${product.id}/variants?page_index=0&page_size=100`,
    undefined,
    true,
  );
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [ratio, setRatio] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = variants.data.filter(
    (variant) => variant.product_id === product.id && variant.is_stock_tracked,
  );
  const source = options.find((variant) => variant.id === sourceId);
  const destination = options.find(
    (variant) => variant.id === destinationId && variant.id !== sourceId,
  );
  const validRatio =
    Number.isInteger(Number(ratio)) && Number(ratio) >= 1 && Number(ratio) <= 1000000;
  const ready = !!source && !!destination && validRatio && !variants.error && !variants.loading;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || offline.status === "offline" || busy) return;
    setError("");
    setBusy(true);
    try {
      const rule = await post<StockConversionRule>("/inventory/stock-conversion-rules", {
        source_variant_id: sourceId,
        destination_variant_id: destinationId,
        destination_quantity: Number(ratio),
        is_active: true,
      });
      await onSaved(rule);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pack size could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {variants.error ? (
        <div className="form-error" role="alert">
          Sellable options could not load: {variants.error}.{" "}
          <Button variant="secondary" onClick={() => void variants.reload()}>
            Retry options
          </Button>
        </div>
      ) : variants.loading ? (
        <Loading />
      ) : (
        <>
          {options.length < 2 && (
            <p role="status">
              {options.length === 0
                ? "This product has no stock-tracked sellable options."
                : "This product has only one stock-tracked sellable option."}{" "}
              Add the missing larger pack or smaller unit under this product to continue.
            </p>
          )}
          <Form onSubmit={save} className={styles.form}>
            <div className={styles.fields}>
              <Field
                label="Larger pack to break"
                hint="Stock is removed from this option when you break a pack."
              >
                <select
                  value={sourceId}
                  onChange={(event) => {
                    setSourceId(event.target.value);
                    setDestinationId("");
                  }}
                  required
                  disabled={busy}
                >
                  <option value="">Choose larger pack</option>
                  {options.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name} ({variant.sku})
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Smaller unit to receive"
                hint="Stock is added to this option. It must belong to the same product."
              >
                <select
                  value={destinationId}
                  onChange={(event) => setDestinationId(event.target.value)}
                  required
                  disabled={!source || busy}
                >
                  <option value="">
                    {!source
                      ? "Choose the larger pack first"
                      : options.length < 2
                        ? "Add a smaller sellable option first"
                        : "Choose smaller unit"}
                  </option>
                  {options
                    .filter((variant) => variant.id !== sourceId)
                    .map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.name} ({variant.sku})
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Smaller units inside one larger pack"
                hint="For example, enter 30 if one Large pack contains 30 Small packets."
              >
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  value={ratio}
                  onChange={(event) => setRatio(event.target.value)}
                  placeholder="30"
                  required
                  disabled={busy}
                />
              </Field>
            </div>
            {ready && (
              <p className={styles.summary} role="status">
                <strong>
                  1 {source.name} = {Number(ratio)} {destination.name}
                </strong>
                Saving this pack size does not change stock.
              </p>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdding(true)}
                disabled={busy || offline.status === "offline"}
              >
                Add sellable option
              </Button>
              <Button type="submit" disabled={!ready || busy || offline.status === "offline"}>
                Save pack size
              </Button>
            </div>
          </Form>
        </>
      )}
      {adding && (
        <VariantManager
          product={product}
          startAdding
          onClose={() => {
            setAdding(false);
            void variants.reload();
          }}
          onOptionsChanged={async () => {
            await variants.reload();
          }}
        />
      )}
    </>
  );
}

export function StockConversionsPage() {
  const { isMerchant, can } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canSetup = isMerchant && can("tenant.write");
  const canConvert = can("tenant.write");
  const { currentShop } = useShop();
  const offline = useOffline();
  const rules = useResource<StockConversionRule>("/inventory/stock-conversion-rules");
  const history = useResource<StockConversion>("/inventory/stock-conversions");
  const products = useResource<Product>(
    canSetup ? "/catalog/products?page_index=0&page_size=100" : "",
    undefined,
    true,
  );
  const productId = searchParams.get("product_id") ?? "";
  const product = products.data.find((item) => item.id === productId && item.is_active);
  const visibleProducts = products.data.filter((item) => item.is_active);
  const locations = useResource<Location>(
    "/inventory/locations?page_index=0&page_size=100",
    undefined,
    true,
  );
  const [ruleId, setRuleId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<{ key: string; value: StockConversionPreview } | null>(
    null,
  );
  const pendingRequest = useRef<{ body: string; key: string } | null>(null);

  const selectedRule = rules.data.find((rule) => rule.id === ruleId && rule.is_active);
  const selectedLocation = shopStockLocation(locations.data, currentShop?.id);
  const selectionKey = `${currentShop?.id}:${ruleId}:${selectedLocation?.id}:${quantity}`;
  const currentPreview = preview?.key === selectionKey ? preview.value : null;

  async function savedRule(rule: StockConversionRule) {
    setPreview(null);
    setRuleId(rule.id);
    setSuccess(
      `Pack size saved: 1 ${rule.source_variant_name} = ${formatQuantity(rule.destination_quantity)} ${rule.destination_variant_name}. Choose how many packs to break below.`,
    );
    await rules.reload();
  }

  async function applyConversion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (
      !canConvert ||
      rules.error ||
      locations.error ||
      rules.loading ||
      locations.loading ||
      !selectedRule ||
      !selectedLocation ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !currentPreview
    ) {
      setError("Choose an active pack size and a whole number of packs.");
      return;
    }
    if (offline.status === "offline") {
      setError("Connect to convert stock. Offline stock conversion is not available yet.");
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify({ rule_id: ruleId, location_id: selectedLocation.id, quantity });
      if (pendingRequest.current?.body !== body)
        pendingRequest.current = { body, key: randomUuid() };
      const result = await api<StockConversion>("/inventory/stock-conversions", {
        method: "POST",
        headers: { "Idempotency-Key": pendingRequest.current.key },
        body,
      });
      pendingRequest.current = null;
      setPreview(null);
      setSuccess(
        `Broke ${formatQuantity(result.source_quantity)} ${selectedRule.source_variant_name} into ${formatQuantity(result.destination_quantity)} ${selectedRule.destination_variant_name}.`,
      );
      await history.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Stock could not be converted.");
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview() {
    setError("");
    if (offline.status === "offline") {
      setError("Connect to preview stock conversion.");
      return;
    }
    if (!selectedRule || !selectedLocation || !Number.isInteger(quantity) || quantity < 1) {
      setError("Choose a pack size and a whole number of packs first.");
      return;
    }
    setBusy(true);
    try {
      const query = new URLSearchParams({
        rule_id: ruleId,
        location_id: selectedLocation.id,
        quantity: String(quantity),
      });
      const value = await api<StockConversionPreview>(
        `/inventory/stock-conversions/preview?${query}`,
      );
      setPreview({ key: selectionKey, value });
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : "Stock conversion preview failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`page-stack ${styles.page}`}>
      <PageHeader
        title="Stock conversion"
        description="Break packs into smaller sellable options. Stock and cost move together in one operation."
      />
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="success-message" role="status">
          {success}
        </div>
      )}

      {offline.status === "offline" && (
        <p role="status">
          Connect to set pack sizes or convert stock. Saved information can still be viewed.
        </p>
      )}
      <div className={styles.workspace}>
        {canSetup && (
          <section className={`card ${styles.panel}`}>
            <div className={styles.sectionHeader}>
              <span className={styles.step} aria-hidden="true">
                1
              </span>
              <div>
                <span className={styles.eyebrow}>Pack configuration</span>
                <h2>Set up a pack size</h2>
              </div>
            </div>
            <p>
              Choose one product, then its larger pack and smaller unit. These are two sellable
              options of the same product, each with its own stock and price.
            </p>
            <p className={styles.note}>
              Example: Cotton wool: 1 Large pack = 30 Small packets. Separately created products
              cannot be converted into each other.
            </p>
            {products.error ? (
              <div className="form-error" role="alert">
                Products could not load: {products.error}.{" "}
                <Button variant="secondary" onClick={() => void products.reload()}>
                  Retry products
                </Button>
              </div>
            ) : products.loading && products.data.length === 0 ? (
              <Loading />
            ) : (
              <>
                <div className={styles.fields}>
                  <Field label="Product">
                    <select
                      value={product?.id ?? ""}
                      onChange={(event) => {
                        const params = new URLSearchParams(searchParams);
                        if (event.target.value) params.set("product_id", event.target.value);
                        else params.delete("product_id");
                        router.replace(`/stock-conversions${params.size ? `?${params}` : ""}`, {
                          scroll: false,
                        });
                        setSuccess("");
                      }}
                    >
                      <option value="">Choose a product</option>
                      {visibleProducts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {visibleProducts.length === 0 && (
                  <p role="status">No active products are available.</p>
                )}
                {productId && !product && (
                  <p role="status">
                    The selected product is unavailable. Choose another active product.
                  </p>
                )}
                {product ? (
                  <PackSetup key={product.id} product={product} onSaved={savedRule} />
                ) : (
                  <p className="muted">Choose a product to see its pack options.</p>
                )}
              </>
            )}
          </section>
        )}

        <section className={`card ${styles.panel}`}>
          <div className={styles.sectionHeader}>
            <span className={styles.step} aria-hidden="true">
              {canSetup ? "2" : "1"}
            </span>
            <div>
              <span className={styles.eyebrow}>Stock movement</span>
              <h2>Convert stock</h2>
            </div>
          </div>
          <p>
            Break larger packs into smaller units using a saved pack size. Preview the stock change
            before confirming.
          </p>
          {rules.error ? (
            <div className="form-error" role="alert">
              Pack sizes could not load: {rules.error}.{" "}
              <Button variant="secondary" onClick={() => void rules.reload()}>
                Retry pack sizes
              </Button>
            </div>
          ) : rules.loading ? (
            <Loading />
          ) : rules.data.filter((rule) => rule.is_active).length === 0 ? (
            <EmptyState
              title="No pack sizes yet"
              message={
                canSetup
                  ? "Choose a product and set up its larger pack and smaller unit above."
                  : "Ask your merchant to set a pack size first."
              }
            />
          ) : (
            <Form onSubmit={applyConversion} className={styles.form}>
              <div className={styles.fields}>
                <Field label="Pack size">
                  <select
                    value={ruleId}
                    onChange={(event) => {
                      setRuleId(event.target.value);
                      setPreview(null);
                    }}
                    disabled={busy}
                    required
                  >
                    <option value="">Select pack size</option>
                    {rules.data
                      .filter((rule) => rule.is_active)
                      .map((rule) => (
                        <option key={rule.id} value={rule.id}>
                          {rule.product_name}: 1 {rule.source_variant_name} →{" "}
                          {formatQuantity(rule.destination_quantity)}{" "}
                          {rule.destination_variant_name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Packs to break">
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    value={quantity}
                    onChange={(event) => {
                      setQuantity(Number(event.target.value));
                      setPreview(null);
                    }}
                    disabled={busy}
                    required
                  />
                </Field>
              </div>
              {locations.error ? (
                <div className="form-error" role="alert">
                  Shop stock could not load: {locations.error}.{" "}
                  <Button variant="secondary" onClick={() => void locations.reload()}>
                    Retry shop stock
                  </Button>
                </div>
              ) : locations.loading ? (
                <Loading />
              ) : !selectedLocation ? (
                <p role="status">Stock is not configured for the selected shop.</p>
              ) : null}
              {selectedRule && Number.isInteger(quantity) && quantity > 0 && (
                <p className={styles.summary} role="status">
                  Break {quantity} {selectedRule.source_variant_name} to receive{" "}
                  {formatQuantity(quantity * selectedRule.destination_quantity)}{" "}
                  {selectedRule.destination_variant_name}.
                </p>
              )}
              {selectedRule && currentPreview && (
                <div className={styles.preview} role="status">
                  <span className={styles.eyebrow}>Stock change at {currentShop?.name}</span>
                  <div className={styles.balance}>
                    <span>{selectedRule.source_variant_name}</span>
                    <strong>
                      {formatQuantity(currentPreview.source_before)}{" "}
                      <span aria-label="to">&rarr;</span>{" "}
                      {formatQuantity(currentPreview.source_after)}
                    </strong>
                  </div>
                  <div className={styles.balance}>
                    <span>{selectedRule.destination_variant_name}</span>
                    <strong>
                      {formatQuantity(currentPreview.destination_before)}{" "}
                      <span aria-label="to">&rarr;</span>{" "}
                      {formatQuantity(currentPreview.destination_after)}
                    </strong>
                  </div>
                </div>
              )}
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={loadPreview}
                  disabled={
                    busy ||
                    !canConvert ||
                    offline.status === "offline" ||
                    !selectedRule ||
                    !selectedLocation ||
                    !!locations.error ||
                    locations.loading
                  }
                >
                  Preview stock change
                </Button>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !canConvert ||
                    offline.status === "offline" ||
                    !currentPreview ||
                    !selectedLocation ||
                    !!locations.error ||
                    locations.loading
                  }
                >
                  Confirm stock conversion
                </Button>
              </div>
            </Form>
          )}
        </section>
      </div>
      <section className={`card ${styles.history}`}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Activity</span>
            <h2>Recent conversions</h2>
          </div>
        </div>
        {history.error ? (
          <div className="form-error" role="alert">
            Conversion history could not load: {history.error}.{" "}
            <Button variant="secondary" onClick={() => void history.reload()}>
              Retry history
            </Button>
          </div>
        ) : history.loading ? (
          <Loading />
        ) : history.data.length === 0 ? (
          <div className={styles.emptyHistory}>
            <strong>No conversions yet.</strong>
            <p>Completed stock conversions will appear here.</p>
          </div>
        ) : (
          <ul className={styles.historyList}>
            {history.data.map((item) => {
              const rule = rules.data.find((candidate) => candidate.id === item.rule_id);
              return (
                <li key={item.id}>
                  <strong>
                    {formatQuantity(item.source_quantity)} {rule?.source_variant_name ?? "packs"} →{" "}
                    {formatQuantity(item.destination_quantity)}{" "}
                    {rule?.destination_variant_name ?? "smaller units"}
                  </strong>
                  <time dateTime={item.applied_at}>
                    {new Date(item.applied_at).toLocaleString()}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
