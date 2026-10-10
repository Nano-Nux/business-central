"use client";

import Link from "next/link";
import { NanoProductForm, saveNanoRetailPrices } from "./nano-product-form";
import { shopStockLocation } from "@/lib/shop-stock-location";
import { NanoProductsTable } from "./nano-products-table";
import { FormEvent, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Form,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  StatCard,
  useListPagination,
} from "./ui";
import { resolveMediaURL } from "@/lib/media-url";
import { api, patch, post, remove } from "@/lib/api";
import { useShop } from "@/lib/shop";
import { randomUuid } from "@/lib/random-uuid";
import { defaultSellableOption } from "@/lib/sellable-option-defaults";
import { queueStockReceipt } from "@/lib/offline-stock";
import { formatMoney } from "@/lib/currency";
import { useResource } from "@/lib/use-resource";
import { useOffline } from "@/lib/offline";
import { useAuth } from "@/lib/auth";
import {
  queueProductCreate,
  queueProductDelete,
  queueProductMetadataUpdate,
} from "@/lib/offline-catalog";
import { queueVariantCreate, queueVariantDelete, queueVariantUpdate } from "@/lib/offline-variants";
import { queueCatalogImageChange } from "@/lib/offline-catalog-images";
import type { OfflineScope } from "@/lib/offline-db";
import { queueAttributeOptionCreate } from "@/lib/offline-attributes";
import type { AttributeOptionMutation } from "@/lib/offline-attributes";
import type {
  AttributeDefinition,
  Brand,
  CatalogImage,
  Category,
  Product,
  Unit,
  Variant,
  Location,
} from "@/lib/types";
import { BarcodeScanner } from "./barcode-scanner";
import { ImageSourceField, imageAction, prepareImageSubmissions } from "./image-source-input";

function categoryPath(category: Category, byID: Map<string, Category>): string {
  const names = [category.name];
  const visited = new Set<string>([category.id]);
  let parentID = category.parent_category_id;
  while (parentID) {
    if (visited.has(parentID)) break;
    visited.add(parentID);
    const parent = byID.get(parentID);
    if (!parent) break;
    names.unshift(parent.name);
    parentID = parent.parent_category_id;
  }
  return names.join(" → ");
}

async function saveSingleImage(
  owner: "product" | "variant",
  ownerID: string,
  current: CatalogImage | undefined,
  values: FormData,
  options: {
    offlineScope?: OfflineScope;
    dependencyOperationId?: string;
    deferUploads?: boolean;
  } = {},
) {
  const action = imageAction(values);
  if (action === "KEEP") return;
  if (options.offlineScope) {
    const submissions = await prepareImageSubmissions(values, "image", {
      deferUploads: options.deferUploads,
    });
    await queueCatalogImageChange(options.offlineScope, {
      owner,
      ownerID,
      current,
      image: submissions[0],
      dependencyOperationId: options.dependencyOperationId,
    });
    return;
  }
  if (action === "REMOVE") {
    if (current) await remove(`/catalog/images/${current.id}`);
    return;
  }
  const [image] = await prepareImageSubmissions(values);
  if (!image) return;
  const basePath =
    owner === "product"
      ? `/catalog/products/${ownerID}/images`
      : `/catalog/variants/${ownerID}/images`;
  const body = {
    image_url: image.image_url,
    source_type: image.source_type,
    position: 0,
  };
  if (current) await patch(`/catalog/images/${current.id}`, body);
  else await post(basePath, body);
}

export function VariantManager({
  product,
  onClose,
  startAdding = false,
  onOptionsChanged,
}: {
  product: Product;
  onClose: () => void;
  startAdding?: boolean;
  onOptionsChanged?: () => Promise<void>;
}) {
  const offline = useOffline();
  const { merchant } = useAuth();
  const nano = merchant?.pos_complexity_level === "NANO";
  const compact = merchant?.pos_complexity_level !== "COMPLEX";
  const variants = useResource<Variant>(
    `/catalog/products/${product.id}/variants?page_index=0&page_size=100`,
    undefined,
    true,
  );
  const units = useResource<Unit>("/units?page_index=0&page_size=100", undefined, true);
  const attributes = useResource<AttributeDefinition>(
    "/catalog/attributes?page_index=0&page_size=100",
  );
  const [editing, setEditing] = useState<Variant | null>(null);
  const [variantBarcode, setVariantBarcode] = useState("");
  const [formOpen, setFormOpen] = useState(startAdding);
  const [valueDefinition, setValueDefinition] = useState<AttributeDefinition | null>(null);
  const [error, setError] = useState("");
  const [valueError, setValueError] = useState("");
  const [saving, setSaving] = useState(false);
  const defaultOption = defaultSellableOption(product.id, variants.data);
  function openValueForm(definition: AttributeDefinition) {
    setValueError("");
    setValueDefinition(definition);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body = {
      sku: String(values.get("sku") ?? "").trim() || editing?.sku || "",
      barcode: variantBarcode.trim() || undefined,
      name: String(values.get("name")).trim(),
      base_unit_id:
        String(values.get("base_unit_id") ?? "").trim() ||
        editing?.base_unit_id ||
        defaultOption?.base_unit_id ||
        "",
      unit_of_measure:
        String(values.get("unit_of_measure") ?? "").trim() ||
        editing?.unit_of_measure ||
        defaultOption?.unit_of_measure ||
        "",
      attributes: Object.fromEntries(
        attributes.data.flatMap((definition) => {
          const field = `attribute_${definition.code}`;
          const raw = String(values.get(field) ?? "").trim();
          if (definition.options.length > 0) {
            if (!raw) return [];
            if (definition.value_type === "BOOLEAN") {
              return [[definition.code, raw === "true"]];
            }
            if (definition.value_type === "NUMBER") {
              const number = Number(raw);
              return Number.isFinite(number) ? [[definition.code, number]] : [];
            }
            if (definition.value_type === "JSON") {
              try {
                return [[definition.code, JSON.parse(raw) as unknown]];
              } catch {
                return [];
              }
            }
            return [[definition.code, raw]];
          }
          if (definition.value_type === "BOOLEAN") {
            return [[definition.code, values.get(field) === "on"]];
          }
          if (!raw) return [];
          if (definition.value_type === "NUMBER") {
            const number = Number(raw);
            return Number.isFinite(number) ? [[definition.code, number]] : [];
          }
          if (definition.value_type === "JSON") {
            try {
              return [[definition.code, JSON.parse(raw) as unknown]];
            } catch {
              return [];
            }
          }
          return [[definition.code, raw]];
        }),
      ),
      is_stock_tracked: values.get("tracked") === "on",
    };
    if (saving) return;
    setSaving(true);
    setError("");
    const imageChanged = imageAction(values) !== "KEEP";
    let saved: Variant | undefined;
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save variants while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        const operation = editing
          ? await queueVariantUpdate(offline.scope, editing, body)
          : await queueVariantCreate(offline.scope, product.id, body);
        if (imageChanged) {
          await saveSingleImage("variant", operation.entityId, editing?.images?.[0], values, {
            offlineScope: offline.scope,
            dependencyOperationId: operation.operationId,
            deferUploads: offline.status === "offline" || !navigator.onLine,
          });
        }
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) saved = await patch<Variant>(`/catalog/variants/${editing.id}`, body);
      else saved = await post<Variant>(`/catalog/products/${product.id}/variants`, body);
      if (saved && imageChanged) {
        await saveSingleImage("variant", saved.id, editing?.images?.[0], values);
      }
      setFormOpen(false);
      setEditing(null);
      await variants.reload();
      await onOptionsChanged?.();
    } catch (reason) {
      if (!editing && saved) setEditing(saved);
      setError(reason instanceof Error ? reason.message : "Sellable option could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  async function saveAttributeValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valueDefinition) return;
    const values = new FormData(event.currentTarget);
    const body: AttributeOptionMutation = {
      definition_id: valueDefinition.id,
      value: String(values.get("value") ?? "").trim(),
      label: String(values.get("label") ?? "").trim(),
      position: Number(values.get("position") ?? 0),
    };
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save attribute values while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queueAttributeOptionCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else {
        await post(`/catalog/attributes/${valueDefinition.id}/options`, body);
      }
      setValueDefinition(null);
      setValueError("");
      await attributes.reload();
    } catch (reason) {
      setValueError(
        reason instanceof Error ? reason.message : "Attribute value could not be saved.",
      );
    }
  }
  async function destroy(item: Variant) {
    if (confirm(`Delete SKU ${item.sku}?`)) {
      try {
        if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
          throw new Error("Offline storage is required to remove variants while disconnected.");
        }
        if (offline.scope && offline.storageAvailable) {
          await queueVariantDelete(offline.scope, item);
          if (navigator.onLine) await offline.syncNow();
        } else {
          await remove(`/catalog/variants/${item.id}`);
        }
        await variants.reload();
        await onOptionsChanged?.();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Variant could not be deleted.");
      }
    }
  }
  return (
    <Modal
      open
      title={`${product.name} · ${compact ? "Sellable options" : "Variants"}`}
      description="Create the larger pack and smaller unit under this product. Each option has its own stock and price; set how many smaller units a pack contains in Stock conversion."
      onClose={onClose}
    >
      <div className="modal-toolbar">
        {!nano && (
          <Link className="button button-secondary" href="/pricing">
            Manage prices
          </Link>
        )}
        <Link
          className="button button-secondary"
          href={`/stock-conversions?product_id=${encodeURIComponent(product.id)}`}
        >
          Stock conversion
        </Link>
        <Button
          icon="plus"
          disabled={offline.status === "offline" && !offline.storageAvailable}
          onClick={() => {
            setEditing(null);
            setVariantBarcode("");
            setError("");
            setFormOpen(true);
          }}
        >
          {compact ? "Add sellable option" : "Add variant"}
        </Button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {variants.error ? (
        <div className="form-error" role="alert">
          Sellable options could not load: {variants.error}
        </div>
      ) : variants.loading ? (
        <Loading />
      ) : variants.data.length === 0 ? (
        <EmptyState
          icon="box"
          title={compact ? "No sellable options" : "No variants"}
          message="Add at least one sellable SKU before pricing or selling this product."
        />
      ) : (
        <div className="variant-list">
          {variants.data.map((item) => (
            <div className="variant-row" key={item.id}>
              <div className="variant-row-main">
                <span className="variant-row-icon">
                  <Icon name="box" size={16} />
                </span>
                <div className="variant-row-copy">
                  <strong>{item.name}</strong>
                  <small className="variant-row-meta">
                    {item.sku}
                    {item.barcode ? ` · ${item.barcode}` : ""}
                  </small>
                </div>
              </div>
              <Badge tone={item.is_stock_tracked ? "info" : "neutral"}>
                {item.is_stock_tracked ? "Stocked" : "Not stocked"}
              </Badge>
              <div className="variant-row-actions">
                <button
                  type="button"
                  title={compact ? "Edit sellable option" : "Edit variant"}
                  aria-label={`Edit ${item.name}`}
                  onClick={() => {
                    setEditing(item);
                    setVariantBarcode(item.barcode ?? "");
                    setFormOpen(true);
                  }}
                >
                  <Icon name="edit" size={15} />
                </button>
                {item.sku !== `STD-${product.id.replaceAll("-", "")}` && (
                  <button
                    type="button"
                    className="danger"
                    title={compact ? "Delete sellable option" : "Delete variant"}
                    aria-label={`Delete ${item.name}`}
                    onClick={() => destroy(item)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={formOpen}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        title={
          compact
            ? editing
              ? "Edit sellable option"
              : "New sellable option"
            : editing
              ? "Edit variant"
              : "New variant"
        }
      >
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field
              label={compact ? "Sellable option name" : "Variant name"}
              hint="For example: Large pack or Small packet"
            >
              <input name="name" defaultValue={editing?.name} required placeholder="Small packet" />
            </Field>
            <Field
              label="SKU"
              hint={
                editing
                  ? "Optional: leaving it blank keeps the current SKU."
                  : "Optional: leave blank to generate a unique SKU automatically."
              }
            >
              <input
                name="sku"
                defaultValue={editing?.sku}
                readOnly={editing?.sku === `STD-${product.id.replaceAll("-", "")}`}
              />
            </Field>
            <Field label="Barcode">
              <BarcodeScanner
                value={variantBarcode}
                onChange={setVariantBarcode}
                placeholder="Variant barcode"
              />
            </Field>
            <ImageSourceField
              key={editing?.id ?? "new-variant"}
              currentUrl={editing?.images?.[0]?.image_url}
            />
            <Field
              label="Base unit"
              hint="Optional: leave unchanged to use the product's default sellable option unit."
            >
              <select name="base_unit_id" defaultValue={editing?.base_unit_id ?? ""}>
                <option value="">
                  {defaultOption
                    ? `Use product default (${units.data.find((unit) => unit.id === defaultOption.base_unit_id)?.name ?? defaultOption.unit_of_measure})`
                    : "Use product default"}
                </option>
                {units.data
                  .filter((unit) => unit.is_active)
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.code})
                    </option>
                  ))}
              </select>
            </Field>
            <div className="wide">
              <Field
                label="Unit label"
                hint="Optional: leave blank to inherit the product default."
              >
                <input
                  name="unit_of_measure"
                  defaultValue={editing?.unit_of_measure ?? defaultOption?.unit_of_measure}
                  placeholder="piece"
                />
              </Field>
            </div>
            <label className="check-field wide">
              <input
                type="checkbox"
                name="tracked"
                defaultChecked={editing?.is_stock_tracked ?? true}
              />
              <span>
                <strong>Track inventory</strong>
                <small>Sales consume stock from the assigned shop</small>
              </span>
            </label>
            {attributes.data.map((definition) => {
              const current = editing?.attributes?.[definition.code];
              const fieldName = `attribute_${definition.code}`;
              if (definition.options.length > 0) {
                const currentValue =
                  definition.value_type === "BOOLEAN"
                    ? current === true
                      ? "true"
                      : current === false
                        ? "false"
                        : ""
                    : definition.value_type === "JSON"
                      ? JSON.stringify(current ?? "")
                      : String(current ?? "");
                return (
                  <div className="attribute-field-group wide" key={definition.id}>
                    <Field
                      label={definition.name}
                      key={definition.id}
                      hint={`${definition.code} · choose a configured value`}
                    >
                      <select name={fieldName} defaultValue={currentValue}>
                        <option value="">Select {definition.name.toLowerCase()}</option>
                        {definition.options.map((option) => (
                          <option key={option.id} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      icon="plus"
                      onClick={() => openValueForm(definition)}
                    >
                      Add value
                    </Button>
                  </div>
                );
              }
              if (definition.value_type === "BOOLEAN") {
                return (
                  <div className="wide" key={definition.id}>
                    <label className="check-field">
                      <input type="checkbox" name={fieldName} defaultChecked={current === true} />
                      <span>
                        <strong>{definition.name}</strong>
                        <small>{definition.code}</small>
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      icon="plus"
                      onClick={() => openValueForm(definition)}
                    >
                      Add value
                    </Button>
                  </div>
                );
              }
              if (definition.value_type === "SELECT") {
                return (
                  <div className="wide" key={definition.id}>
                    <Field
                      label={definition.name}
                      hint={`${definition.code} · configure a value first`}
                    >
                      <select name={fieldName} defaultValue={String(current ?? "")}>
                        <option value="">Select {definition.name.toLowerCase()}</option>
                      </select>
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      icon="plus"
                      onClick={() => openValueForm(definition)}
                    >
                      Add value
                    </Button>
                  </div>
                );
              }
              return (
                <div className="wide" key={definition.id}>
                  <Field
                    label={definition.name}
                    hint={`${definition.code} · no configured values yet`}
                  >
                    <input
                      name={fieldName}
                      type={
                        definition.value_type === "NUMBER"
                          ? "number"
                          : definition.value_type === "DATE"
                            ? "date"
                            : "text"
                      }
                      defaultValue={
                        definition.value_type === "JSON"
                          ? JSON.stringify(current ?? "")
                          : String(current ?? "")
                      }
                      placeholder={definition.value_type === "JSON" ? "{}" : undefined}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    icon="plus"
                    onClick={() => openValueForm(definition)}
                  >
                    Add value
                  </Button>
                </div>
              );
            })}
          </div>
          {units.error && (
            <div className="form-error" role="alert">
              Units could not load: {units.error}.{" "}
              <Button type="button" variant="secondary" onClick={() => void units.reload()}>
                Retry units
              </Button>
            </div>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {compact ? "Save sellable option" : "Save variant"}
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        open={Boolean(valueDefinition)}
        onClose={() => setValueDefinition(null)}
        title={`Add ${valueDefinition?.name ?? "attribute"} value`}
        description="This value will become a dropdown choice for this product's variants."
      >
        <Form onSubmit={saveAttributeValue}>
          <div className="form-grid">
            <Field label="Value" hint={`${valueDefinition?.code ?? "ATTRIBUTE"} · stored value`}>
              <input name="value" required autoFocus />
            </Field>
            <Field label="Display label">
              <input name="label" required />
            </Field>
            <Field label="Position">
              <input name="position" type="number" min="0" defaultValue="0" />
            </Field>
          </div>
          {valueError && <div className="form-error">{valueError}</div>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setValueDefinition(null)}>
              Cancel
            </Button>
            <Button type="submit">Save value</Button>
          </div>
        </Form>
      </Modal>
    </Modal>
  );
}

export function ProductManager({
  onSaved,
  combinedStorage = false,
}: { onSaved?: () => void; combinedStorage?: boolean } = {}) {
  const offline = useOffline();
  const { merchant } = useAuth();
  const nano = merchant?.pos_complexity_level === "NANO" || combinedStorage;
  const mini = merchant?.pos_complexity_level === "MINI" || nano;
  const simple = merchant?.pos_complexity_level === "SIMPLE" || mini;
  const { currentShop } = useShop();
  const locations = useResource<Location>(
    nano ? "/inventory/locations?page_index=0&page_size=100" : "",
  );
  const stockLocations = locations.data.filter(
    (location) => location.is_active && location.shop_id === currentShop?.id,
  );
  const stockRequest = useRef<{ body: string; id: string } | null>(null);
  const [categoryChoice, setCategoryChoice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [brandChoice, setBrandChoice] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [brandBusy, setBrandBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [stockProductReady, setStockProductReady] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const products = useResource<Product>(
    "/catalog/products?page_index=0&page_size=100",
    undefined,
    nano,
  );
  const categories = useResource<Category>("/catalog/categories?page_index=0&page_size=200");
  const brands = useResource<Brand>("/catalog/brands?page_index=0&page_size=200");
  const brandMap = useMemo(() => {
    return new Map(brands.data.map((b) => [b.id, b.name]));
  }, [brands.data]);
  const categoryLabels = useMemo(() => {
    const byID = new Map(categories.data.map((category) => [category.id, category]));
    return new Map(categories.data.map((category) => [category.id, categoryPath(category, byID)]));
  }, [categories.data]);
  const units = useResource<Unit>("/units?page_index=0&page_size=100");
  const attributes = useResource<AttributeDefinition>(
    "/catalog/attributes?page_index=0&page_size=100",
  );
  const stats = useMemo(() => {
    const total = products.data.length;
    const active = products.data.filter((p) => p.is_active).length;
    const inactive = total - active;
    const physical = products.data.filter((p) => p.product_type === "PHYSICAL").length;
    const services = products.data.filter((p) => p.product_type === "SERVICE").length;
    const digital = products.data.filter((p) => p.product_type === "DIGITAL").length;
    return { total, active, inactive, physical, services, digital };
  }, [products.data]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const [editing, setEditing] = useState<Product | null>(null);
  const editingVariants = useResource<Variant>(
    editing ? `/catalog/products/${editing.id}/variants?page_index=0&page_size=100` : "",
  );
  const hasManagedStandardVariant = editingVariants.data.some(
    (variant) => variant.sku === `STD-${editing?.id.replaceAll("-", "")}`,
  );
  const canEditInlinePrice = !editing || hasManagedStandardVariant || stockProductReady;
  const [productBarcode, setProductBarcode] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const visible = useMemo(() => {
    const matches = products.data
      .filter((item) =>
        `${item.name} ${item.barcode ?? ""} ${item.description ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .filter(
        (item) =>
          filter === "ALL" ||
          (filter === "ACTIVE"
            ? item.is_active
            : filter === "INACTIVE"
              ? !item.is_active
              : item.product_type === filter),
      );
    return matches.sort((a, b) => {
      if (sort === "NAME_DESC") return b.name.localeCompare(a.name);
      if (sort === "TYPE_ASC")
        return a.product_type.localeCompare(b.product_type) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [filter, products.data, query, sort]);
  const pagination = useListPagination(visible, 10, `${query}|${filter}|${sort}`);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProduct || brandBusy) return;
    setSavingProduct(true);
    const values = new FormData(event.currentTarget);
    const originalPriceRaw = values.get("original_price");
    const sellPriceRaw = values.get("sell_price");
    const originalPrice =
      originalPriceRaw !== null && String(originalPriceRaw).trim() !== ""
        ? String(originalPriceRaw).trim()
        : undefined;
    const sellPrice =
      sellPriceRaw !== null && String(sellPriceRaw).trim() !== ""
        ? String(sellPriceRaw).trim()
        : undefined;

    const body = {
      name: String(values.get("name")).trim(),
      barcode: productBarcode.trim() || undefined,
      description: String(values.get("description") || "") || undefined,
      product_type: String(values.get("product_type") || (mini ? "PHYSICAL" : "")),
      manufacture_date: String(values.get("manufacture_date") || "") || undefined,
      expired_date: String(values.get("expired_date") || "") || undefined,
      brand_id: String(values.get("brand_id") || "") || undefined,
      is_active: values.get("active") === "on",
      category_ids: simple
        ? values.get("category_id")
          ? [String(values.get("category_id"))]
          : []
        : editing?.category_ids,
      ...(mini
        ? {
            original_price: originalPrice,
            sell_price: sellPrice,
          }
        : {}),
      ...(simple && !editing
        ? {
            standard_variant: {
              base_unit_id: mini ? "" : String(values.get("base_unit_id")),
              attributes: mini
                ? {}
                : Object.fromEntries(
                    attributes.data.flatMap((definition) => {
                      const raw = String(values.get(`attribute_${definition.code}`) ?? "").trim();
                      return raw
                        ? [
                            [
                              definition.code,
                              definition.value_type === "NUMBER"
                                ? Number(raw)
                                : definition.value_type === "BOOLEAN"
                                  ? raw === "true"
                                  : raw,
                            ],
                          ]
                        : [];
                    }),
                  ),
              is_stock_tracked: true,
              ...(mini
                ? {
                    original_price: originalPrice,
                  }
                : {}),
            },
          }
        : {}),
    };
    const imageChanged = imageAction(values) !== "KEEP";
    let saved: Product | undefined;
    try {
      const openingQuantity = nano ? String(values.get("opening_quantity") || "0") : "0";
      const stockLocation = shopStockLocation(stockLocations, currentShop?.id);
      if (nano && editing && values.get("nano_prices_ready") !== "yes") {
        throw new Error(
          "Wait for retail prices to load before saving. Check any pricing error above.",
        );
      }
      if (Number(openingQuantity) > 0 && (!stockLocation || (!editing && !originalPrice))) {
        throw new Error(
          "The current shop needs an active stock location and an original price before adding opening stock.",
        );
      }
      if (simple && !navigator.onLine) {
        throw new Error(
          "Product saving requires a connection so the backend can manage its standard variant atomically.",
        );
      }
      if (!navigator.onLine && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save products while disconnected.");
      }
      if (!simple && offline.scope && offline.storageAvailable) {
        const operation = editing
          ? await queueProductMetadataUpdate(offline.scope, editing, {
              ...body,
              category_ids: editing.category_ids,
            })
          : await queueProductCreate(offline.scope, {
              ...body,
              category_ids: [],
            });
        if (imageChanged) {
          await saveSingleImage("product", operation.entityId, editing?.images?.[0], values, {
            offlineScope: offline.scope,
            dependencyOperationId: operation.operationId,
            deferUploads: offline.status === "offline" || !navigator.onLine,
          });
        }
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) saved = await patch<Product>(`/catalog/products/${editing.id}`, body);
      else saved = await post<Product>("/catalog/products", body);
      if (nano && editing && saved) await saveNanoRetailPrices(values);
      if (nano && saved && Number(openingQuantity) > 0 && stockLocation?.shop_id) {
        // Keep the created product on a partial failure; retry only edits it.
        if (!editing || hasManagedStandardVariant) setStockProductReady(true);
        setEditing(saved);
        const savedProductID = saved.id;
        const variants = await api<Variant[]>(
          `/catalog/products/${saved.id}/variants?page_index=0&page_size=100`,
        );
        const standard = variants.find(
          (variant) => variant.sku === `STD-${savedProductID.replaceAll("-", "")}`,
        );
        if (!standard)
          throw new Error("Product saved. Add stock to its existing variants in Storage.");
        const receipt = {
          variant_id: standard.id,
          destination_location_id: stockLocation.id,
          unit_id: standard.base_unit_id,
          quantity: openingQuantity,
          ...(originalPrice ? { unit_cost: originalPrice } : {}),
        };
        const receiptBody = JSON.stringify(receipt);
        if (stockRequest.current?.body !== receiptBody)
          stockRequest.current = { body: receiptBody, id: randomUuid() };
        const id = stockRequest.current.id;
        const payload = { ...receipt, event_key: `nano-opening-stock:${id}` };
        if (offline.scope && offline.storageAvailable) {
          await queueStockReceipt(offline.scope, stockLocation.shop_id, payload, id);
          if (navigator.onLine) await offline.syncNow();
          await offline.refresh();
          setNotice(
            "Product saved. Opening stock recorded locally; check synchronization details for its validation status.",
          );
        } else {
          await post("/inventory/stock-in", payload);
          setNotice("Product and opening stock saved.");
        }
      }
      if (saved && imageChanged) {
        // SIMPLE mode intentionally stores the image on the product, never on
        // its backend-managed Standard variant.
        await saveSingleImage("product", saved.id, editing?.images?.[0], values);
      }
      setFormOpen(false);
      setEditing(null);
      stockRequest.current = null;
      await products.reload();
      onSaved?.();
    } catch (reason) {
      if (!editing && saved) setEditing(saved);
      const message = reason instanceof Error ? reason.message : "Product could not be saved.";
      setError(saved && nano ? `Product saved. ${message}` : message);
    } finally {
      setSavingProduct(false);
    }
  }
  async function createCategory() {
    if (!newCategory.trim() || categoryBusy) return;
    setCategoryBusy(true);
    try {
      const saved = await post<Category>("/catalog/categories", {
        name: newCategory.trim(),
        sort_order: 0,
      });
      await categories.reload();
      setCategoryChoice(saved.id);
      setNewCategory("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Category could not be saved.");
    } finally {
      setCategoryBusy(false);
    }
  }
  async function createBrand() {
    if (!newBrand.trim() || brandBusy || savingProduct) return;
    setBrandBusy(true);
    setError("");
    try {
      const saved = await post<Brand>("/catalog/brands", {
        name: newBrand.trim(),
        is_active: true,
      });
      await brands.reload();
      brands.updateLocal((rows) =>
        rows.some((row) => row.id === saved.id) ? rows : [...rows, saved],
      );
      setBrandChoice(saved.id);
      setNewBrand("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Brand could not be saved.");
    } finally {
      setBrandBusy(false);
    }
  }
  async function destroy(item: Product) {
    if (
      confirm(`Delete ${item.name}? This is allowed only when it has no referenced sales or stock.`)
    ) {
      try {
        if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
          throw new Error("Offline storage is required to remove products while disconnected.");
        }
        if (offline.scope && offline.storageAvailable) {
          await queueProductDelete(offline.scope, item);
          if (navigator.onLine) await offline.syncNow();
        } else await remove(`/catalog/products/${item.id}`);
        await products.reload();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Product could not be deleted.");
      }
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title={nano ? "Products & storage" : "Products"}
        description={
          mini
            ? nano
              ? "Manage products, prices and stock in one place."
              : "Create products with direct original and sell pricing."
            : simple
              ? "Create products with one automatically managed selling and stock unit."
              : "Manage product records and the variants that become sellable SKUs."
        }
        action={
          <Button
            icon="plus"
            onClick={() => {
              setEditing(null);
              stockRequest.current = null;
              setCategoryChoice("");
              setBrandChoice("");
              setNewBrand("");
              setStockQuantity("0");
              setStockProductReady(false);

              setProductBarcode("");
              setError("");
              setFormOpen(true);
            }}
          >
            New product
          </Button>
        }
      />
      {error && <div className="form-error">{error}</div>}
      {notice && (
        <p role="status" className="banner">
          {notice}
        </p>
      )}
      {!nano && (
        <div className="stats-grid products-stats-grid">
          <StatCard
            label="Total Products"
            value={String(stats.total)}
            note={`${stats.active} active in catalog`}
            icon="box"
            tone="mint"
          />
          <StatCard
            label="Active vs Inactive"
            value={`${stats.active} / ${stats.inactive}`}
            note="Sellable in POS"
            icon="check"
            tone="blue"
          />
          <StatCard
            label="Physical & Services"
            value={`${stats.physical} / ${stats.services}`}
            note={stats.digital > 0 ? `${stats.digital} digital items` : "Catalog item types"}
            icon="tag"
            tone="amber"
          />
          <StatCard
            label="Catalog Coverage"
            value={`${categories.data.length} categories`}
            note={`${brands.data.length} brands configured`}
            icon="catalog"
            tone="purple"
          />
        </div>
      )}

      <div className="products-controls">
        <div className="products-controls-top">
          <div className="products-search-wrap">
            <BarcodeScanner
              value={query}
              onChange={setQuery}
              placeholder="Search products or barcode…"
            />
            <div className="search-box legacy-search">
              <Icon name="search" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products or barcode…"
              />
            </div>
          </div>
          <div className="products-quick-actions">
            <div className="products-sort-wrap">
              <select
                className="filter-select"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-label="Sort products"
              >
                <option value="NAME_ASC">Name: A–Z</option>
                <option value="NAME_DESC">Name: Z–A</option>
                <option value="TYPE_ASC">Sort by Type</option>
              </select>
            </div>
            {!nano && (
              <Link href="/pricing" className="button button-secondary">
                <Icon name="tag" size={15} />
                <span>Prices</span>
              </Link>
            )}
            {!simple && (
              <Link href="/catalog/variant-attributes" className="button button-secondary">
                <Icon name="catalog" size={15} />
                <span>Variant attributes</span>
              </Link>
            )}
          </div>
        </div>

        <div className="products-filter-tabs" role="tablist" aria-label="Filter products">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "ALL"}
            className={`filter-tab ${filter === "ALL" ? "active" : ""}`}
            onClick={() => setFilter("ALL")}
          >
            <span>All products</span>
            <span className="tab-count">{stats.total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "ACTIVE"}
            className={`filter-tab ${filter === "ACTIVE" ? "active" : ""}`}
            onClick={() => setFilter("ACTIVE")}
          >
            <span>Active</span>
            <span className="tab-count">{stats.active}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "INACTIVE"}
            className={`filter-tab ${filter === "INACTIVE" ? "active" : ""}`}
            onClick={() => setFilter("INACTIVE")}
          >
            <span>Inactive</span>
            <span className="tab-count">{stats.inactive}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "PHYSICAL"}
            className={`filter-tab ${filter === "PHYSICAL" ? "active" : ""}`}
            onClick={() => setFilter("PHYSICAL")}
          >
            <span>Physical</span>
            <span className="tab-count">{stats.physical}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "SERVICE"}
            className={`filter-tab ${filter === "SERVICE" ? "active" : ""}`}
            onClick={() => setFilter("SERVICE")}
          >
            <span>Services</span>
            <span className="tab-count">{stats.services}</span>
          </button>
        </div>
      </div>

      {nano ? (
        <NanoProductsTable
          products={visible}
          resetKey={`${query}|${filter}|${sort}`}
          loading={products.loading}
          error={products.error}
          brandMap={brandMap}
          categoryLabels={categoryLabels}
          onEdit={(item) => {
            setEditing(item);
            setCategoryChoice("");
            setBrandChoice("");
            setNewBrand("");
            setStockQuantity("0");
            setStockProductReady(false);

            stockRequest.current = null;
            setProductBarcode(item.barcode ?? "");
            setError("");
            setFormOpen(true);
          }}
          onPacks={setSelected}
          onDelete={destroy}
        />
      ) : (
        <div className="table-card products-table-card">
          {products.loading ? (
            <Loading />
          ) : products.error ? (
            <EmptyState title="Products could not load" message={products.error} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="box"
              title="No products found"
              message={
                query
                  ? "No product matches this search."
                  : mini
                    ? "Create a product to get started."
                    : simple
                      ? "Create a product, then set its price."
                      : "Create a product, add a variant, then set its price."
              }
            />
          ) : (
            <>
              <div className="products-desktop-table">
                <table className="products-table data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Classification</th>
                      {!mini && <th>Type</th>}
                      {mini && <th>Cost</th>}
                      {mini && <th>Sell price</th>}
                      <th>Status</th>
                      <th>{simple ? "Pack sizes" : "Variants"}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.pageItems.map((item) => {
                      const imageUrl = item.images?.[0]?.image_url
                        ? resolveMediaURL(item.images[0].image_url)
                        : null;
                      const brandName = item.brand_id ? brandMap.get(item.brand_id) : null;
                      const primaryCategoryId = item.category_ids?.[0];
                      const categoryName = primaryCategoryId
                        ? categoryLabels.get(primaryCategoryId)
                        : null;

                      return (
                        <tr key={item.id}>
                          <td>
                            <button
                              className="product-cell-btn product-link"
                              onClick={() => {
                                if (simple) {
                                  setEditing(item);
                                  setCategoryChoice("");
                                  setBrandChoice("");
                                  setNewBrand("");
                                  setStockQuantity("0");
                                  setStockProductReady(false);

                                  stockRequest.current = null;
                                  setProductBarcode(item.barcode ?? "");
                                  setFormOpen(true);
                                } else {
                                  setSelected(item);
                                }
                              }}
                            >
                              <div className="product-avatar">
                                {imageUrl ? (
                                  <img
                                    src={imageUrl}
                                    alt={item.name}
                                    className="product-thumb-img"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                      const next = e.currentTarget
                                        .nextElementSibling as HTMLElement | null;
                                      if (next) next.style.display = "grid";
                                    }}
                                  />
                                ) : null}
                                <span
                                  className="product-thumb-placeholder"
                                  style={imageUrl ? { display: "none" } : undefined}
                                >
                                  <Icon name="box" size={18} />
                                </span>
                              </div>
                              <div className="product-cell-copy cell-main">
                                <strong>{item.name}</strong>
                                <small>{item.description || "No description"}</small>
                                {item.barcode && (
                                  <span
                                    className="product-barcode-pill"
                                    title={`Barcode: ${item.barcode}`}
                                  >
                                    <Icon name="cart" size={11} />
                                    <span>{item.barcode}</span>
                                  </span>
                                )}
                              </div>
                            </button>
                          </td>
                          <td>
                            <div className="product-classification">
                              {brandName && <span className="product-brand-tag">{brandName}</span>}
                              {categoryName && (
                                <span className="product-category-tag" title={categoryName}>
                                  {categoryName}
                                </span>
                              )}
                              {!brandName && !categoryName && <small className="muted">—</small>}
                            </div>
                          </td>
                          {!mini && (
                            <td>
                              <Badge
                                tone={
                                  item.product_type === "PHYSICAL"
                                    ? "info"
                                    : item.product_type === "SERVICE"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {item.product_type.charAt(0) +
                                  item.product_type.slice(1).toLowerCase()}
                              </Badge>
                            </td>
                          )}
                          {mini && (
                            <td>
                              {item.original_price
                                ? formatMoney(item.original_price, merchant?.default_currency_code)
                                : "—"}
                            </td>
                          )}
                          {mini && (
                            <td>
                              {item.sell_price
                                ? formatMoney(item.sell_price, merchant?.default_currency_code)
                                : "—"}
                            </td>
                          )}
                          <td>
                            <Badge tone={item.is_active ? "success" : "neutral"}>
                              {item.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          {
                            <td>
                              <button
                                type="button"
                                className="variant-pill-btn"
                                title={simple ? "Manage pack sizes" : "Manage variants"}
                                onClick={() => setSelected(item)}
                              >
                                <Icon name="catalog" size={14} />
                                <span>{simple ? "Pack sizes" : "Variants"}</span>
                              </button>
                            </td>
                          }
                          <td>
                            <div className="row-actions">
                              {
                                <button
                                  type="button"
                                  title={simple ? "Manage pack sizes" : "Manage variants"}
                                  aria-label={`Manage pack sizes for ${item.name}`}
                                  onClick={() => setSelected(item)}
                                >
                                  <Icon name="catalog" size={15} />
                                </button>
                              }
                              <button
                                type="button"
                                title="Edit"
                                aria-label={`Edit ${item.name}`}
                                onClick={() => {
                                  setEditing(item);
                                  setCategoryChoice("");
                                  setBrandChoice("");
                                  setNewBrand("");
                                  setStockQuantity("0");
                                  setStockProductReady(false);

                                  stockRequest.current = null;
                                  setProductBarcode(item.barcode ?? "");
                                  setFormOpen(true);
                                }}
                              >
                                <Icon name="edit" size={15} />
                              </button>
                              <button
                                type="button"
                                className="danger"
                                title="Delete"
                                aria-label={`Delete ${item.name}`}
                                onClick={() => destroy(item)}
                              >
                                <Icon name="trash" size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Product Cards */}
              <div className="products-mobile-cards">
                {pagination.pageItems.map((item) => {
                  const imageUrl = item.images?.[0]?.image_url
                    ? resolveMediaURL(item.images[0].image_url)
                    : null;
                  const brandName = item.brand_id ? brandMap.get(item.brand_id) : null;
                  const primaryCategoryId = item.category_ids?.[0];
                  const categoryName = primaryCategoryId
                    ? categoryLabels.get(primaryCategoryId)
                    : null;

                  return (
                    <div className="product-mobile-card" key={item.id}>
                      <div className="product-mobile-card-top">
                        <div className="product-avatar">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={item.name}
                              className="product-thumb-img"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const next = e.currentTarget
                                  .nextElementSibling as HTMLElement | null;
                                if (next) next.style.display = "grid";
                              }}
                            />
                          ) : null}
                          <span
                            className="product-thumb-placeholder"
                            style={imageUrl ? { display: "none" } : undefined}
                          >
                            <Icon name="box" size={18} />
                          </span>
                        </div>
                        <div className="product-mobile-card-copy">
                          <strong>{item.name}</strong>
                          <small>{item.description || "No description"}</small>
                        </div>
                        <Badge tone={item.is_active ? "success" : "neutral"}>
                          {item.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>

                      <div className="product-mobile-card-tags">
                        {!mini && (
                          <Badge
                            tone={
                              item.product_type === "PHYSICAL"
                                ? "info"
                                : item.product_type === "SERVICE"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {item.product_type.charAt(0) + item.product_type.slice(1).toLowerCase()}
                          </Badge>
                        )}
                        {mini && item.original_price && (
                          <span className="product-barcode-pill" title="Cost">
                            Cost:{" "}
                            {formatMoney(item.original_price, merchant?.default_currency_code)}
                          </span>
                        )}
                        {mini && item.sell_price && (
                          <span className="product-barcode-pill" title="Sell price">
                            Price: {formatMoney(item.sell_price, merchant?.default_currency_code)}
                          </span>
                        )}
                        {item.barcode && (
                          <span className="product-barcode-pill">
                            <Icon name="cart" size={11} />
                            <span>{item.barcode}</span>
                          </span>
                        )}
                        {brandName && <span className="product-brand-tag">{brandName}</span>}
                        {categoryName && (
                          <span className="product-category-tag">{categoryName}</span>
                        )}
                      </div>

                      <div className="product-mobile-card-footer">
                        {
                          <button
                            type="button"
                            className="variant-pill-btn"
                            onClick={() => setSelected(item)}
                          >
                            <Icon name="catalog" size={14} />
                            <span>{simple ? "Pack sizes" : "Variants"}</span>
                          </button>
                        }

                        <div className="product-mobile-card-actions">
                          <button
                            type="button"
                            title="Edit"
                            aria-label={`Edit ${item.name}`}
                            onClick={() => {
                              setEditing(item);
                              setCategoryChoice("");
                              setBrandChoice("");
                              setNewBrand("");
                              setStockQuantity("0");
                              setStockProductReady(false);

                              stockRequest.current = null;
                              setProductBarcode(item.barcode ?? "");
                              setFormOpen(true);
                            }}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <button
                            type="button"
                            className="danger"
                            title="Delete"
                            aria-label={`Delete ${item.name}`}
                            onClick={() => destroy(item)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
      {!nano && (
        <Pagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
          itemLabel="products"
          onPageChange={pagination.setPageIndex}
        />
      )}
      <Modal
        open={formOpen}
        onClose={() => {
          if (!savingProduct) setFormOpen(false);
        }}
        description={
          nano
            ? editing
              ? "Update product details and retail prices in one place."
              : "Start with a name and price. Add optional details when needed."
            : undefined
        }
        title={editing ? "Edit product" : "New product"}
      >
        {nano ? (
          <NanoProductForm
            allowInlineCatalogCreation={merchant?.pos_complexity_level !== "MINI"}
            key={formOpen ? "open-product" : "closed-product"}
            editing={editing}
            barcode={productBarcode}
            onBarcode={setProductBarcode}
            categories={categories.data}
            brands={brands.data}
            categoryChoice={categoryChoice}
            onCategory={setCategoryChoice}
            newCategory={newCategory}
            onNewCategory={setNewCategory}
            categoryBusy={categoryBusy}
            onCreateCategory={createCategory}
            brandChoice={brandChoice}
            onBrand={setBrandChoice}
            newBrand={newBrand}
            onNewBrand={setNewBrand}
            brandBusy={brandBusy}
            onCreateBrand={createBrand}
            canEditCost={canEditInlinePrice}
            stockQuantity={stockQuantity}
            onStockQuantity={setStockQuantity}
            shopName={currentShop?.name}
            error={error}
            busy={savingProduct}
            onSubmit={save}
            onClose={() => setFormOpen(false)}
          />
        ) : (
          <Form onSubmit={save}>
            <div className="form-grid">
              <Field label="Product name">
                <input name="name" defaultValue={editing?.name} required />
              </Field>
              <Field label="Product barcode">
                <BarcodeScanner
                  value={productBarcode}
                  onChange={setProductBarcode}
                  placeholder="Optional product barcode"
                />
              </Field>
              {mini ? (
                <input
                  type="hidden"
                  name="product_type"
                  value={editing?.product_type ?? "PHYSICAL"}
                />
              ) : (
                <Field label="Product type">
                  <select name="product_type" defaultValue={editing?.product_type ?? "PHYSICAL"}>
                    <option value="PHYSICAL">Physical</option>
                    <option value="DIGITAL">Digital</option>
                    <option value="SERVICE">Service</option>
                  </select>
                </Field>
              )}
              {mini && canEditInlinePrice && (
                <>
                  <Field
                    label="Original price (cost)"
                    hint="Baseline purchase cost for this product"
                  >
                    <input
                      name="original_price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      defaultValue={editing?.original_price ?? ""}
                    />
                  </Field>
                  <Field
                    label="Sell price (retail)"
                    hint="Selling price in standard retail price list"
                  >
                    <input
                      name="sell_price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      defaultValue={editing?.sell_price ?? ""}
                    />
                  </Field>
                </>
              )}
              {mini && editing && !editingVariants.loading && !hasManagedStandardVariant && (
                <p className="wide">
                  This product was created with explicit variants. Use Pack sizes and Manage prices
                  to edit each sellable option; changing POS mode keeps those variants and prices.
                </p>
              )}
              <Field label="Manufacture date (optional)">
                <input
                  name="manufacture_date"
                  type="date"
                  defaultValue={editing?.manufacture_date?.slice(0, 10)}
                />
              </Field>
              <Field label="Expired date (optional)">
                <input
                  name="expired_date"
                  type="date"
                  defaultValue={editing?.expired_date?.slice(0, 10)}
                />
              </Field>
              {simple && !nano && (
                <Field label="Catalog attachment">
                  <select name="category_id" defaultValue={editing?.category_ids?.[0] ?? ""}>
                    <option value="">No catalog category</option>
                    {categories.data.map((category) => (
                      <option key={category.id} value={category.id}>
                        {categoryLabels.get(category.id) ?? category.name}
                      </option>
                    ))}
                  </select>
                  <Link className="text-link" href="/categories">
                    Manage catalog choices
                  </Link>
                </Field>
              )}
              <Field label="Brand">
                <select name="brand_id" defaultValue={editing?.brand_id ?? ""}>
                  <option value="">No brand</option>
                  {brands.data
                    .filter((brand) => brand.is_active)
                    .map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                </select>
                {!nano && (
                  <Link className="text-link" href="/brands">
                    Manage brands
                  </Link>
                )}
              </Field>
              <div className="wide">
                <Field label="Description">
                  <textarea name="description" defaultValue={editing?.description} />
                </Field>
              </div>
              <ImageSourceField
                key={editing?.id ?? "new-product"}
                currentUrl={editing?.images?.[0]?.image_url}
              />
              {simple && !editing && !mini && (
                <>
                  <Field label="Unit attachment">
                    <select name="base_unit_id" required defaultValue="">
                      <option value="">Select unit</option>
                      {units.data
                        .filter((unit) => unit.is_active)
                        .map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name} ({unit.code})
                          </option>
                        ))}
                    </select>
                    <Link className="text-link" href="/units">
                      Manage unit choices
                    </Link>
                  </Field>
                  {attributes.data.map((definition) => (
                    <Field key={definition.id} label={`${definition.name} attachment`}>
                      {definition.options.length > 0 ? (
                        <select name={`attribute_${definition.code}`} defaultValue="">
                          <option value="">Not attached</option>
                          {definition.options.map((option) => (
                            <option key={option.id} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : definition.value_type === "BOOLEAN" ? (
                        <select name={`attribute_${definition.code}`} defaultValue="">
                          <option value="">Not attached</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          name={`attribute_${definition.code}`}
                          type={definition.value_type === "NUMBER" ? "number" : "text"}
                        />
                      )}
                    </Field>
                  ))}
                </>
              )}
              <label className="check-field wide">
                <input type="checkbox" name="active" defaultChecked={editing?.is_active ?? true} />
                <span>
                  <strong>Active product</strong>
                  <small>Can be configured for sale</small>
                </span>
              </label>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save product</Button>
            </div>
          </Form>
        )}
      </Modal>
      {selected && (
        <VariantManager
          product={selected}
          onClose={() => {
            setSelected(null);
            if (nano) void products.reload();
          }}
        />
      )}
    </>
  );
}
