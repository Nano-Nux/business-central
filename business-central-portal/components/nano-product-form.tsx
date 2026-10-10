"use client";

import { type FormEvent, useState } from "react";
import { post } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import type { Brand, Category, PriceList, Product, ProductPrice, Variant } from "@/lib/types";
import { BarcodeScanner } from "./barcode-scanner";
import { ImageSourceField } from "./image-source-input";
import { Button, Field, Form, Loading } from "./ui";

function RetailPriceFields({ product }: { product: Product }) {
  const [now] = useState(() => Date.now());
  const variants = useResource<Variant>(
    `/catalog/products/${product.id}/variants?page_index=0&page_size=100`,
    undefined,
    true,
  );
  const lists = useResource<PriceList>(
    "/pricing/price-lists?page_index=0&page_size=100",
    undefined,
    true,
  );
  const retail = lists.data.find((list) => list.code === "RETAIL");
  const prices = useResource<ProductPrice>(
    retail ? `/pricing/price-lists/${retail.id}/prices?page_index=0&page_size=200` : "",
    undefined,
    true,
  );
  const loading = variants.loading || lists.loading || prices.loading;
  const error = variants.error || lists.error || prices.error;
  const ready = !loading && !error && !!retail;
  return (
    <>
      <input type="hidden" name="nano_prices_ready" value={ready ? "yes" : "no"} />
      <input type="hidden" name="nano_retail_list" value={retail?.id ?? ""} />
      {loading ? (
        <Loading />
      ) : error ? (
        <p role="alert" className="form-error">
          Retail prices could not load: {error}
        </p>
      ) : !retail ? (
        <p role="alert" className="form-error">
          Set up a RETAIL price list in Pricing before editing prices.
        </p>
      ) : (
        <div className="form-grid">
          {variants.data.map((variant) => {
            const price = prices.data
              .filter(
                (row) =>
                  row.variant_id === variant.id &&
                  new Date(row.valid_from).getTime() <= now &&
                  (!row.valid_until || new Date(row.valid_until).getTime() >= now),
              )
              .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
            return (
              <div key={`${variant.id}:${price?.amount ?? ""}`}>
                <Field
                  label={
                    variants.data.length === 1
                      ? "Sell price (retail)"
                      : `${variant.name} retail price`
                  }
                >
                  <input
                    name={`nano_price_${variant.id}`}
                    type="number"
                    required={!!price}
                    min="0"
                    step="0.01"
                    placeholder="Not set"
                    defaultValue={price?.amount ?? ""}
                  />
                </Field>
                <input
                  type="hidden"
                  name={`nano_initial_${variant.id}`}
                  value={price?.amount ?? ""}
                />
                <input
                  type="hidden"
                  name={`nano_from_${variant.id}`}
                  value={price?.valid_from ?? ""}
                />
                <input
                  type="hidden"
                  name={`nano_until_${variant.id}`}
                  value={price?.valid_until ?? ""}
                />
              </div>
            );
          })}
          {!variants.data.length && (
            <p>No pack sizes yet. Add a pack size to set its retail price.</p>
          )}
        </div>
      )}
    </>
  );
}

export async function saveNanoRetailPrices(values: FormData) {
  const listID = String(values.get("nano_retail_list") ?? "");
  for (const [name, raw] of values.entries()) {
    if (!name.startsWith("nano_price_")) continue;
    const variantID = name.slice("nano_price_".length);
    const amount = String(raw).trim();
    const initial = String(values.get(`nano_initial_${variantID}`) ?? "");
    if (!amount || (initial !== "" && Number(amount) === Number(initial))) continue;
    await post("/pricing/prices", {
      price_list_id: listID,
      variant_id: variantID,
      amount,
      valid_from: String(values.get(`nano_from_${variantID}`) || new Date().toISOString()),
      ...(values.get(`nano_until_${variantID}`)
        ? { valid_until: String(values.get(`nano_until_${variantID}`)) }
        : {}),
    });
  }
}

export function NanoProductForm({
  allowInlineCatalogCreation,
  editing,
  barcode,
  onBarcode,
  categories,
  brands,
  categoryChoice,
  onCategory,
  newCategory,
  onNewCategory,
  categoryBusy,
  onCreateCategory,
  brandChoice,
  onBrand,
  newBrand,
  onNewBrand,
  brandBusy,
  onCreateBrand,
  canEditCost,
  stockQuantity,
  onStockQuantity,
  shopName,
  error,
  busy,
  onSubmit,
  onClose,
}: {
  allowInlineCatalogCreation: boolean;
  editing: Product | null;
  barcode: string;
  onBarcode: (value: string) => void;
  categories: Category[];
  brands: Brand[];
  categoryChoice: string;
  onCategory: (value: string) => void;
  newCategory: string;
  onNewCategory: (value: string) => void;
  categoryBusy: boolean;
  onCreateCategory: () => void;
  brandChoice: string;
  onBrand: (value: string) => void;
  newBrand: string;
  onNewBrand: (value: string) => void;
  brandBusy: boolean;
  onCreateBrand: () => void;
  canEditCost: boolean;
  stockQuantity: string;
  onStockQuantity: (value: string) => void;
  shopName?: string;
  error: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const category =
    categoryChoice === "none" ? "" : categoryChoice || editing?.category_ids?.[0] || "";
  return (
    <Form onSubmit={onSubmit}>
      <div className="nano-product-form">
        <input type="hidden" name="product_type" value={editing?.product_type ?? "PHYSICAL"} />
        <section className="nano-form-section">
          <h3>Product details</h3>
          <Field label="Product name">
            <input
              name="name"
              defaultValue={editing?.name}
              placeholder="e.g. Green tea"
              required
              autoFocus
            />
          </Field>
          <div className="form-grid">
            <Field label="Product barcode" hint="Optional. Scan or enter the barcode.">
              <BarcodeScanner
                value={barcode}
                onChange={onBarcode}
                placeholder="Optional product barcode"
              />
            </Field>
            <Field label="Category (optional)">
              <select
                name="category_id"
                value={category}
                onChange={(event) => onCategory(event.target.value || "none")}
              >
                <option value="">No category</option>
                {categories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {allowInlineCatalogCreation && (
            <details className="nano-form-details">
              <summary>Add a category</summary>
              <div className="nano-category-create">
                <input
                  aria-label="New category name"
                  placeholder="New category"
                  value={newCategory}
                  onChange={(event) => onNewCategory(event.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={categoryBusy || !newCategory.trim()}
                  onClick={onCreateCategory}
                >
                  Add category
                </Button>
              </div>
            </details>
          )}
        </section>
        <section className="nano-form-section">
          <h3>Pricing</h3>
          <p className="muted-text">
            Retail prices are the same prices used in the RETAIL price list.
          </p>
          {canEditCost && (
            <Field label="Original price (cost)" hint="Purchase cost per piece.">
              <input
                name="original_price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                defaultValue={editing?.original_price ?? ""}
              />
            </Field>
          )}
          {editing ? (
            <RetailPriceFields product={editing} />
          ) : (
            <Field label="Sell price (retail)">
              <input name="sell_price" type="number" min="0" step="0.01" placeholder="0.00" />
            </Field>
          )}
        </section>
        {canEditCost && (!editing || Number(stockQuantity) > 0) && (
          <section className="nano-form-section">
            <h3>{editing ? "Opening stock to finish" : "Opening stock"}</h3>
            <Field
              label={editing ? "Stock to add (optional)" : "Opening stock (optional)"}
              hint={`Recorded in ${shopName || "the current shop"}. Leave at zero to add stock later.`}
            >
              <input
                name="opening_quantity"
                type="number"
                min="0"
                step="1"
                value={stockQuantity}
                onChange={(event) => onStockQuantity(event.target.value)}
              />
            </Field>
          </section>
        )}
        <details className="nano-form-details">
          <summary>
            More details <span>Photo, brand, dates and description</span>
          </summary>
          <div className="form-grid">
            <div>
              <Field label="Brand">
                <select
                  name="brand_id"
                  value={brandChoice === "none" ? "" : brandChoice || editing?.brand_id || ""}
                  onChange={(event) => onBrand(event.target.value || "none")}
                >
                  <option value="">No brand</option>
                  {brands
                    .filter((row) => row.is_active)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </Field>
              {allowInlineCatalogCreation && (
                <details className="nano-form-details">
                  <summary>Add a brand</summary>
                  <div className="nano-category-create">
                    <input
                      aria-label="New brand name"
                      placeholder="New brand"
                      value={newBrand}
                      onChange={(event) => onNewBrand(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={brandBusy || busy || !newBrand.trim()}
                      onClick={onCreateBrand}
                    >
                      {brandBusy ? "Adding…" : "Add brand"}
                    </Button>
                  </div>
                </details>
              )}
            </div>
            <Field label="Manufacture date (optional)">
              <input
                name="manufacture_date"
                type="date"
                defaultValue={editing?.manufacture_date?.slice(0, 10)}
              />
            </Field>
            <Field label="Expiry date (optional)">
              <input
                name="expired_date"
                type="date"
                defaultValue={editing?.expired_date?.slice(0, 10)}
              />
            </Field>
            <div className="wide">
              <Field label="Description">
                <textarea name="description" defaultValue={editing?.description} rows={2} />
              </Field>
            </div>
            <ImageSourceField currentUrl={editing?.images?.[0]?.image_url} />
          </div>
        </details>
        <label className="check-field">
          <input type="checkbox" name="active" defaultChecked={editing?.is_active ?? true} />
          <span>
            <strong>Active product</strong>
            <small>Available for sale</small>
          </span>
        </label>
      </div>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || brandBusy}>
          {busy ? "Saving…" : "Save product"}
        </Button>
      </div>
    </Form>
  );
}
