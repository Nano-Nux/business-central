"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
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
  useListPagination,
} from "./ui";
import { patch, post, remove } from "@/lib/api";
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

function VariantManager({ product, onClose }: { product: Product; onClose: () => void }) {
  const offline = useOffline();
  const variants = useResource<Variant>(
    `/catalog/products/${product.id}/variants?page_index=0&page_size=100`,
  );
  const units = useResource<Unit>("/units?page_index=0&page_size=100");
  const attributes = useResource<AttributeDefinition>(
    "/catalog/attributes?page_index=0&page_size=100",
  );
  const [editing, setEditing] = useState<Variant | null>(null);
  const [variantBarcode, setVariantBarcode] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [valueDefinition, setValueDefinition] = useState<AttributeDefinition | null>(null);
  const [error, setError] = useState("");
  const [valueError, setValueError] = useState("");
  function openValueForm(definition: AttributeDefinition) {
    setValueError("");
    setValueDefinition(definition);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body = {
      sku: String(values.get("sku")).trim(),
      barcode: variantBarcode.trim() || undefined,
      name: String(values.get("name")).trim(),
      base_unit_id: String(values.get("base_unit_id")),
      unit_of_measure: String(values.get("unit_of_measure") || "").trim() || "EA",
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
    } catch (reason) {
      if (!editing && saved) setEditing(saved);
      setError(reason instanceof Error ? reason.message : "Variant could not be saved.");
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
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Variant could not be deleted.");
      }
    }
  }
  return (
    <Modal
      open
      title={`${product.name} · Variants`}
      description="Each sellable SKU and its stock-tracking unit."
      onClose={onClose}
    >
      <div className="modal-toolbar">
        <Link className="button button-secondary" href="/pricing">
          Manage prices
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
          Add variant
        </Button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {variants.loading ? (
        <Loading />
      ) : variants.data.length === 0 ? (
        <EmptyState
          icon="box"
          title="No variants"
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
                  title="Edit variant"
                  aria-label={`Edit ${item.name}`}
                  onClick={() => {
                    setEditing(item);
                    setVariantBarcode(item.barcode ?? "");
                    setFormOpen(true);
                  }}
                >
                  <Icon name="edit" size={15} />
                </button>
                <button
                  type="button"
                  className="danger"
                  title="Delete variant"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => destroy(item)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit variant" : "New variant"}
      >
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field label="Variant name">
              <input name="name" defaultValue={editing?.name} required placeholder="Standard" />
            </Field>
            <Field label="SKU">
              <input name="sku" defaultValue={editing?.sku} required />
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
            <Field label="Base unit">
              <select name="base_unit_id" defaultValue={editing?.base_unit_id} required>
                <option value="">Select unit</option>
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
              <Field label="Unit label">
                <input
                  name="unit_of_measure"
                  defaultValue={editing?.unit_of_measure}
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
                  <div className="wide" key={definition.id}>
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
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save variant</Button>
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

export function ProductManager() {
  const offline = useOffline();
  const { merchant } = useAuth();
  const simple = merchant?.pos_complexity_level === "SIMPLE";
  const products = useResource<Product>("/catalog/products?page_index=0&page_size=100");
  const categories = useResource<Category>("/catalog/categories?page_index=0&page_size=200");
  const brands = useResource<Brand>("/catalog/brands?page_index=0&page_size=200");
  const categoryLabels = useMemo(() => {
    const byID = new Map(categories.data.map((category) => [category.id, category]));
    return new Map(categories.data.map((category) => [category.id, categoryPath(category, byID)]));
  }, [categories.data]);
  const units = useResource<Unit>("/units?page_index=0&page_size=100");
  const attributes = useResource<AttributeDefinition>(
    "/catalog/attributes?page_index=0&page_size=100",
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const [editing, setEditing] = useState<Product | null>(null);
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
    const values = new FormData(event.currentTarget);
    const body = {
      name: String(values.get("name")).trim(),
      barcode: productBarcode.trim() || undefined,
      description: String(values.get("description") || "") || undefined,
      product_type: String(values.get("product_type")),
      manufacture_date: String(values.get("manufacture_date") || "") || undefined,
      expired_date: String(values.get("expired_date") || "") || undefined,
      brand_id: String(values.get("brand_id") || "") || undefined,
      is_active: values.get("active") === "on",
      category_ids:
        simple && values.get("category_id")
          ? [String(values.get("category_id"))]
          : editing?.category_ids,
      ...(simple && !editing
        ? {
            standard_variant: {
              base_unit_id: String(values.get("base_unit_id")),
              attributes: Object.fromEntries(
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
            },
          }
        : {}),
    };
    const imageChanged = imageAction(values) !== "KEEP";
    let saved: Product | undefined;
    try {
      if (simple && offline.status === "offline") {
        throw new Error(
          "POS simple product creation requires a connection so the backend can create its standard variant atomically.",
        );
      }
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
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
      if (saved && imageChanged) {
        // SIMPLE mode intentionally stores the image on the product, never on
        // its backend-managed Standard variant.
        await saveSingleImage("product", saved.id, editing?.images?.[0], values);
      }
      setFormOpen(false);
      setEditing(null);
      await products.reload();
    } catch (reason) {
      if (!editing && saved) setEditing(saved);
      setError(reason instanceof Error ? reason.message : "Product could not be saved.");
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
        title="Products"
        description={
          simple
            ? "Create products with one automatically managed selling and stock unit."
            : "Manage product records and the variants that become sellable SKUs."
        }
        action={
          <Button
            icon="plus"
            onClick={() => {
              setEditing(null);
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
      <div className="toolbar">
        <BarcodeScanner
          value={query}
          onChange={setQuery}
          placeholder="Search products or barcode"
        />
        <div className="search-box legacy-search">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products or barcode…"
          />
        </div>
        <select
          className="filter-select"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter products"
        >
          <option value="ALL">All products</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PHYSICAL">Physical</option>
          <option value="SERVICE">Services</option>
        </select>
        <select
          className="filter-select"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort products"
        >
          <option value="NAME_ASC">Name A–Z</option>
          <option value="NAME_DESC">Name Z–A</option>
          <option value="TYPE_ASC">Type</option>
        </select>
        <Link href="/pricing" className="button button-secondary">
          Prices
        </Link>

        {!simple && (
          <Link href="/catalog/attributes" className="button button-secondary">
            Variant attributes
          </Link>
        )}
      </div>
      <div className="table-card">
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
                : simple
                  ? "Create a product, then set its price."
                  : "Create a product, add a variant, then set its price."
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      className="product-link"
                      onClick={() => {
                        if (simple) {
                          setEditing(item);
                          setProductBarcode(item.barcode ?? "");
                          setFormOpen(true);
                        } else {
                          setSelected(item);
                        }
                      }}
                    >
                      <span>
                        <Icon name="box" size={17} />
                      </span>
                      <div className="cell-main">
                        <strong>{item.name}</strong>
                        <small>{item.description || "No description"}</small>
                      </div>
                    </button>
                  </td>
                  <td>{item.product_type.toLowerCase()}</td>
                  <td>
                    <Badge tone={item.is_active ? "success" : "neutral"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      {!simple && (
                        <button title="Manage variants" onClick={() => setSelected(item)}>
                          <Icon name="catalog" size={15} />
                        </button>
                      )}
                      <button
                        title="Edit"
                        onClick={() => {
                          setEditing(item);
                          setProductBarcode(item.barcode ?? "");
                          setFormOpen(true);
                        }}
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="danger" title="Delete" onClick={() => destroy(item)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        itemLabel="products"
        onPageChange={pagination.setPageIndex}
      />
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit product" : "New product"}
      >
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
            <Field label="Product type">
              <select name="product_type" defaultValue={editing?.product_type ?? "PHYSICAL"}>
                <option value="PHYSICAL">Physical</option>
                <option value="DIGITAL">Digital</option>
                <option value="SERVICE">Service</option>
              </select>
            </Field>
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
            {simple && (
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
              <Link className="text-link" href="/brands">
                Manage brands
              </Link>
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
            {simple && !editing && (
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
      </Modal>
      {!simple && selected && (
        <VariantManager product={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
