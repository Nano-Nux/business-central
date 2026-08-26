"use client";

import { FormEvent, useMemo, useState } from "react";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Form,
  Loading,
  ListControls,
  Modal,
  PageHeader,
  Pagination,
  useListPagination,
} from "./ui";
import { patch, post, remove } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useOffline } from "@/lib/offline";
import {
  queueProductCreate,
  queueProductDelete,
  queueProductMetadataUpdate,
} from "@/lib/offline-catalog";
import {
  queueConversionCreate,
  queueConversionDelete,
  queueConversionUpdate,
  queueUnitCreate,
  queueUnitDelete,
  queueUnitUpdate,
} from "@/lib/offline-units";
import type { Category, Conversion, Product, Unit } from "@/lib/types";

function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <div className="form-error">
      <Icon name="close" size={16} />
      {message}
    </div>
  ) : null;
}

function categoryTreeRows(categories: Category[]) {
  const children = new Map<string, Category[]>();
  categories.forEach((category) => {
    const parentID = category.parent_category_id ?? "";
    const siblings = children.get(parentID) ?? [];
    siblings.push(category);
    children.set(parentID, siblings);
  });
  children.forEach((siblings) =>
    siblings.sort(
      (left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name),
    ),
  );
  const rows: Array<{ category: Category; depth: number }> = [];
  const visited = new Set<string>();
  const append = (parentID: string, depth: number) => {
    (children.get(parentID) ?? []).forEach((category) => {
      if (visited.has(category.id)) return;
      visited.add(category.id);
      rows.push({ category, depth });
      append(category.id, depth + 1);
    });
  };
  append("", 0);
  categories.forEach((category) => {
    if (!visited.has(category.id)) {
      rows.push({ category, depth: 0 });
      append(category.id, 1);
    }
  });
  return rows;
}

export function ProductsPage() {
  const offline = useOffline();
  const { data, loading, error, reload } = useResource<Product>(
    "/catalog/products?page_index=0&page_size=100",
  );
  const categories = useResource<Category>("/catalog/categories?page_index=0&page_size=200");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedCategoryIDs, setSelectedCategoryIDs] = useState<string[]>([]);
  const categoryRows = useMemo(() => categoryTreeRows(categories.data), [categories.data]);
  const visible = useMemo(
    () =>
      data.filter((item) =>
        `${item.name} ${item.description ?? ""} ${(item.category_names ?? []).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [data, query],
  );
  const pagination = useListPagination(visible, 10);
  const launch = (product?: Product) => {
    setEditing(product ?? null);
    setSelectedCategoryIDs(product?.category_ids ?? []);
    setFormError("");
    setOpen(true);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    const values = new FormData(event.currentTarget);
    const body = {
      name: String(values.get("name")),
      description: String(values.get("description") || "") || undefined,
      product_type: String(values.get("product_type") || "PHYSICAL"),
      manufacture_date: String(values.get("manufacture_date") || "") || undefined,
      expired_date: String(values.get("expired_date") || "") || undefined,
      is_active: values.get("is_active") === "on",
      category_ids: selectedCategoryIDs,
    };
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save product metadata while disconnected.");
      }
      if (!editing && offline.scope && offline.storageAvailable) {
        await queueProductCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (editing && offline.scope && offline.storageAvailable) {
        await queueProductMetadataUpdate(offline.scope, editing, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) await patch(`/catalog/products/${editing.id}`, body);
      else await post("/catalog/products", body);
      setOpen(false);
      await reload();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to save product.");
    } finally {
      setBusy(false);
    }
  }
  async function destroy(item: Product) {
    if (!confirm(`Delete ${item.name}?`)) return;
    if (offline.scope && offline.storageAvailable) {
      await queueProductDelete(offline.scope, item);
      if (navigator.onLine) await offline.syncNow();
    } else if (offline.status === "offline") {
      setFormError("Offline storage is required to remove a product while disconnected.");
      return;
    } else {
      await remove(`/catalog/products/${item.id}`);
    }
    await reload();
  }
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Create products first, then add sellable variants and SKUs."
        action={
          <Button icon="plus" onClick={() => launch()} disabled={offline.status === "offline"}>
            New product
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
          />
        </div>
        <select className="filter-select">
          <option>All products</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
      </div>
      <div className="table-card">
        {loading ? (
          <Loading />
        ) : error ? (
          <EmptyState title="Products could not load" message={error} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No products yet"
            message="Add your first product to start selling and tracking stock."
            action={
              <Button icon="plus" onClick={() => launch()} disabled={offline.status === "offline"}>
                Add product
              </Button>
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Categories</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="product-cell">
                      <span>
                        <Icon name="box" size={17} />
                      </span>
                      <div className="cell-main">
                        <strong>{item.name}</strong>
                        <small>{item.description || "No description"}</small>
                      </div>
                    </div>
                  </td>
                  <td>{item.product_type.toLowerCase()}</td>
                  <td>
                    {(item.category_names ?? []).length > 0 ? (
                      <div className="product-category-tags">
                        {item.category_names.map((name, index) => (
                          <span key={item.category_ids?.[index] ?? `${name}-${index}`}>{name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted-text">Uncategorized</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={item.is_active ? "success" : "neutral"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => launch(item)} aria-label="Edit">
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        className="danger"
                        disabled={offline.status === "offline"}
                        onClick={() => destroy(item)}
                        aria-label="Delete"
                      >
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
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit product" : "New product"}
        description="Basic product details. Variants can be added after saving."
      >
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field label="Product name">
              <input
                name="name"
                defaultValue={editing?.name}
                required
                placeholder="e.g. Organic green tea"
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
                type="date"
                name="manufacture_date"
                defaultValue={editing?.manufacture_date?.slice(0, 10)}
              />
            </Field>
            <Field label="Expired date (optional)">
              <input
                type="date"
                name="expired_date"
                defaultValue={editing?.expired_date?.slice(0, 10)}
              />
            </Field>
            <div className="wide">
              <Field label="Description">
                <textarea name="description" defaultValue={editing?.description} />
              </Field>
            </div>
            <div className="field wide">
              <span>Categories</span>
              {categories.loading ? (
                <small>Loading categories…</small>
              ) : categories.error ? (
                <small className="field-error">{categories.error}</small>
              ) : categoryRows.length === 0 ? (
                <div className="category-picker-empty">
                  No categories yet. Create one on the Categories page first.
                </div>
              ) : (
                <div className="product-category-picker">
                  {categoryRows.map(({ category, depth }) => (
                    <label
                      key={category.id}
                      className="product-category-option"
                      style={{ paddingLeft: `${12 + depth * 22}px` }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategoryIDs.includes(category.id)}
                        onChange={(event) =>
                          setSelectedCategoryIDs((current) =>
                            event.target.checked
                              ? [...current, category.id]
                              : current.filter((id) => id !== category.id),
                          )
                        }
                      />
                      <span className="category-option-marker" aria-hidden="true">
                        {depth > 0 ? "└" : "●"}
                      </span>
                      <span>
                        <strong>{category.name}</strong>
                        <small>{depth > 0 ? "Child category" : "Top-level category"}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <small>
                Select the most specific category. You can select more than one when a product
                belongs in multiple catalog sections.
              </small>
            </div>
            <label className="check-field">
              <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} />
              <span>
                <strong>Active product</strong>
                <small>Visible for sale and catalog operations</small>
              </span>
            </label>
          </div>
          <ErrorNotice message={formError} />
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save product"}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}

export function UnitsPage() {
  const offline = useOffline();
  const { data, loading, error, reload } = useResource<Unit>("/units?page_index=0&page_size=100");
  const [query, setQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [unitSort, setUnitSort] = useState("NAME_ASC");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [formError, setFormError] = useState("");
  const visible = useMemo(
    () =>
      data
        .filter(
          (item) =>
            `${item.code} ${item.name} ${item.symbol ?? ""} ${item.dimension_code}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (unitFilter === "ALL" ||
              (unitFilter === "ACTIVE"
                ? item.is_active
                : unitFilter === "INACTIVE"
                  ? !item.is_active
                  : item.dimension_code === unitFilter)),
        )
        .sort((a, b) =>
          unitSort === "NAME_DESC"
            ? b.name.localeCompare(a.name)
            : unitSort === "CODE_ASC"
              ? a.code.localeCompare(b.code)
              : unitSort === "DIMENSION"
                ? a.dimension_code.localeCompare(b.dimension_code)
                : a.name.localeCompare(b.name),
        ),
    [data, query, unitFilter, unitSort],
  );
  const pagination = useListPagination(visible, 10, `${query}|${unitFilter}|${unitSort}`);
  const launch = (item?: Unit) => {
    setEditing(item ?? null);
    setFormError("");
    setOpen(true);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = new FormData(event.currentTarget);
    const body = {
      code: String(v.get("code")).toUpperCase(),
      name: String(v.get("name")),
      symbol: String(v.get("symbol") || "") || undefined,
      dimension_code: String(v.get("dimension_code") || "COUNT"),
      allows_decimal: v.get("allows_decimal") === "on",
      is_active: v.get("is_active") === "on",
    };
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save units while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        if (editing) await queueUnitUpdate(offline.scope, editing, body);
        else await queueUnitCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) await patch(`/units/${editing.id}`, body);
      else await post("/units", body);
      setOpen(false);
      await reload();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to save unit.");
    }
  }
  async function destroy(item: Unit) {
    if (!confirm(`Delete unit ${item.name}?`)) return;
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to remove units while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queueUnitDelete(offline.scope, item);
        if (navigator.onLine) await offline.syncNow();
      } else await remove(`/units/${item.id}`);
      await reload();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to remove unit.");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Units"
        description="Define how products are counted, measured and sold."
        action={
          <Button
            icon="plus"
            disabled={offline.status === "offline" && !offline.storageAvailable}
            onClick={() => launch()}
          >
            New unit
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search units…"
          />
        </div>
        <select
          className="filter-select"
          value={unitFilter}
          onChange={(event) => setUnitFilter(event.target.value)}
          aria-label="Filter units"
        >
          <option value="ALL">All units</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="COUNT">Count</option>
          <option value="WEIGHT">Weight</option>
          <option value="VOLUME">Volume</option>
          <option value="LENGTH">Length</option>
        </select>
        <select
          className="filter-select"
          value={unitSort}
          onChange={(event) => setUnitSort(event.target.value)}
          aria-label="Sort units"
        >
          <option value="NAME_ASC">Name A–Z</option>
          <option value="NAME_DESC">Name Z–A</option>
          <option value="CODE_ASC">Code A–Z</option>
          <option value="DIMENSION">Dimension</option>
        </select>
      </div>
      <div className="table-card">
        {loading ? (
          <Loading />
        ) : error ? (
          <EmptyState title="Units could not load" message={error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="package"
            title="No units yet"
            message="Create units such as piece, box, kilogram or litre."
            action={
              <Button onClick={() => launch()} icon="plus">
                Add unit
              </Button>
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Dimension</th>
                <th>Decimal</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.code}</strong>
                  </td>
                  <td>
                    {item.name} {item.symbol && <small>({item.symbol})</small>}
                  </td>
                  <td>{item.dimension_code}</td>
                  <td>{item.allows_decimal ? "Allowed" : "Whole only"}</td>
                  <td>
                    <Badge tone={item.is_active ? "success" : "neutral"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => launch(item)}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="danger" onClick={() => destroy(item)}>
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
        itemLabel="units"
        onPageChange={pagination.setPageIndex}
      />
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit unit" : "New unit"}>
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field label="Code">
              <input name="code" defaultValue={editing?.code} required placeholder="PCS" />
            </Field>
            <Field label="Name">
              <input name="name" defaultValue={editing?.name} required placeholder="Piece" />
            </Field>
            <Field label="Symbol">
              <input name="symbol" defaultValue={editing?.symbol} />
            </Field>
            <Field label="Dimension">
              <select name="dimension_code" defaultValue={editing?.dimension_code ?? "COUNT"}>
                <option>COUNT</option>
                <option>MASS</option>
                <option>VOLUME</option>
                <option>LENGTH</option>
                <option>TIME</option>
              </select>
            </Field>
            <label className="check-field">
              <input
                name="allows_decimal"
                type="checkbox"
                defaultChecked={editing?.allows_decimal}
              />
              <span>
                <strong>Allow decimals</strong>
                <small>For weighted or measured quantities</small>
              </span>
            </label>
            <label className="check-field">
              <input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? true} />
              <span>
                <strong>Active</strong>
                <small>Available when creating products</small>
              </span>
            </label>
          </div>
          <ErrorNotice message={formError} />
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save unit</Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}

export function ConversionsPage() {
  const offline = useOffline();
  const units = useResource<Unit>("/units?page_index=0&page_size=100");
  const conversions = useResource<Conversion>("/unit-conversions?page_index=0&page_size=100");
  const [conversionQuery, setConversionQuery] = useState("");
  const [conversionFilter, setConversionFilter] = useState("ALL");
  const [conversionSort, setConversionSort] = useState("FROM_ASC");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Conversion | null>(null);
  const [formError, setFormError] = useState("");
  const unitNames = useMemo(
    () => new Map(units.data.map((unit) => [unit.id, unit.name])),
    [units.data],
  );
  const name = (id: string) => unitNames.get(id) ?? id.slice(0, 8);
  const visibleConversions = useMemo(
    () =>
      conversions.data
        .filter(
          (item) =>
            `${unitNames.get(item.from_unit_id) ?? item.from_unit_id} ${unitNames.get(item.to_unit_id) ?? item.to_unit_id} ${item.multiplier}`
              .toLowerCase()
              .includes(conversionQuery.toLowerCase()) &&
            (conversionFilter === "ALL" ||
              (conversionFilter === "ACTIVE" ? item.is_active : !item.is_active)),
        )
        .sort((a, b) =>
          conversionSort === "FROM_DESC"
            ? (unitNames.get(b.from_unit_id) ?? "").localeCompare(
                unitNames.get(a.from_unit_id) ?? "",
              )
            : conversionSort === "TO_ASC"
              ? (unitNames.get(a.to_unit_id) ?? "").localeCompare(unitNames.get(b.to_unit_id) ?? "")
              : conversionSort === "MULTIPLIER_DESC"
                ? Number(b.multiplier) - Number(a.multiplier)
                : (unitNames.get(a.from_unit_id) ?? "").localeCompare(
                    unitNames.get(b.from_unit_id) ?? "",
                  ),
        ),
    [conversionFilter, conversionQuery, conversionSort, conversions.data, unitNames],
  );
  const pagination = useListPagination(
    visibleConversions,
    10,
    `${conversionQuery}|${conversionFilter}|${conversionSort}`,
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = new FormData(event.currentTarget);
    const body = {
      from_unit_id: String(v.get("from")),
      to_unit_id: String(v.get("to")),
      multiplier: String(v.get("multiplier")),
      additive_offset: "0",
      is_active: true,
    };
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save conversions while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        if (editing) await queueConversionUpdate(offline.scope, editing, body);
        else await queueConversionCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) await patch(`/unit-conversions/${editing.id}`, body);
      else await post("/unit-conversions", body);
      setOpen(false);
      await conversions.reload();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to save conversion.");
    }
  }
  async function destroy(item: Conversion) {
    if (!confirm("Delete this conversion?")) return;
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to remove conversions while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queueConversionDelete(offline.scope, item);
        if (navigator.onLine) await offline.syncNow();
      } else await remove(`/unit-conversions/${item.id}`);
      await conversions.reload();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to remove conversion.");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Unit conversions"
        description="Connect purchasing packs to the base units you stock and sell."
        action={
          <Button
            icon="plus"
            disabled={offline.status === "offline" && !offline.storageAvailable}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New conversion
          </Button>
        }
      />
      <div className="notice">
        <strong>Example:</strong> If one case contains 24 pieces, convert Case → Piece with a
        multiplier of 24.
      </div>
      <ListControls
        search={conversionQuery}
        onSearchChange={setConversionQuery}
        searchPlaceholder="Search units or multiplier"
        filter={conversionFilter}
        onFilterChange={setConversionFilter}
        filterLabel="Filter conversions"
        filterOptions={[
          { value: "ALL", label: "All conversions" },
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "Inactive" },
        ]}
        sort={conversionSort}
        onSortChange={setConversionSort}
        sortLabel="Sort conversions"
        sortOptions={[
          { value: "FROM_ASC", label: "From unit A–Z" },
          { value: "FROM_DESC", label: "From unit Z–A" },
          { value: "TO_ASC", label: "To unit A–Z" },
          { value: "MULTIPLIER_DESC", label: "Largest multiplier" },
        ]}
      />
      <div className="table-card">
        {conversions.loading ? (
          <Loading />
        ) : conversions.error ? (
          <EmptyState title="Conversions could not load" message={conversions.error} />
        ) : visibleConversions.length === 0 ? (
          <EmptyState
            icon="swap"
            title="No conversions yet"
            message="Add a conversion when you buy and sell a product in different units."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th></th>
                <th>To</th>
                <th>Multiplier</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>1 {name(item.from_unit_id)}</strong>
                  </td>
                  <td>→</td>
                  <td>
                    {item.multiplier} {name(item.to_unit_id)}
                  </td>
                  <td>× {item.multiplier}</td>
                  <td>
                    <Badge tone={item.is_active ? "success" : "neutral"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        onClick={() => {
                          setEditing(item);
                          setOpen(true);
                        }}
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="danger" onClick={() => destroy(item)}>
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
        itemLabel="conversions"
        onPageChange={pagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit conversion" : "New conversion"}
      >
        <Form onSubmit={save}>
          <div className="conversion-form">
            <Field label="From unit">
              <select name="from" defaultValue={editing?.from_unit_id} required>
                <option value="">Select unit</option>
                {units.data.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </Field>
            <span>
              <Icon name="arrow" />
            </span>
            <Field label="To unit">
              <select name="to" defaultValue={editing?.to_unit_id} required>
                <option value="">Select unit</option>
                {units.data.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Multiplier" hint="How many destination units are in one source unit?">
            <input
              name="multiplier"
              type="number"
              step="0.000001"
              min="0.000001"
              defaultValue={editing?.multiplier ?? "1"}
              required
            />
          </Field>
          <ErrorNotice message={formError} />
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save conversion</Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
