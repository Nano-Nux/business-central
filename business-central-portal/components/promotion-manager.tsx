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
import type { Product, Promotion, Variant } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import { formatMoney } from "@/lib/currency";
import {
  queuePromotionCodeCreate,
  queuePromotionCodeDelete,
  queuePromotionCreate,
  queuePromotionDelete,
  queuePromotionScopeCreate,
  queuePromotionScopeDelete,
  queuePromotionUpdate,
} from "@/lib/offline-promotions";

type PromotionCode = {
  id: string;
  code: string;
  is_active: boolean;
  usage_limit?: number;
  redemption_count: number;
};
type PromotionScope = {
  id: string;
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
};
type CatalogVariant = Variant & { product_name: string };

function PromotionConfiguration({
  promotion,
  onClose,
}: {
  promotion: Promotion;
  onClose: () => void;
}) {
  const offline = useOffline();
  const codes = useResource<PromotionCode>(
    `/promotions/${promotion.id}/codes?page_index=0&page_size=100`,
  );
  const scopes = useResource<PromotionScope>(
    `/promotions/${promotion.id}/products?page_index=0&page_size=100`,
  );
  const products = useResource<Product>("/catalog/products?page_index=0&page_size=100");
  const variants = useResource<CatalogVariant>("/pos/catalog?page_index=0&page_size=200");
  const [error, setError] = useState("");
  const [productId, setProductId] = useState("");
  async function addScope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
      setError("Offline storage is required to save promotion scopes while disconnected.");
      return;
    }
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    const productID = String(values.get("product_id"));
    const variantID = String(values.get("variant_id") || "");
    try {
      const body = {
        product_id: productID,
        ...(variantID ? { variant_id: variantID } : {}),
      };
      if (offline.scope && offline.storageAvailable) {
        await queuePromotionScopeCreate(
          offline.scope,
          promotion,
          body,
          products.data.find((item) => item.id === productID),
        );
        if (navigator.onLine) await offline.syncNow();
      } else {
        await post("/promotions/products", { promotion_id: promotion.id, ...body });
      }
      formElement.reset();
      setProductId("");
      await scopes.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product scope could not be added.");
    }
  }
  async function addCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
      setError("Offline storage is required to save promotion codes while disconnected.");
      return;
    }
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    try {
      const body = {
        code: String(values.get("code")).trim().toUpperCase(),
        is_active: true,
        ...(values.get("limit") ? { usage_limit: Number(values.get("limit")) } : {}),
      };
      if (offline.scope && offline.storageAvailable) {
        await queuePromotionCodeCreate(offline.scope, promotion, body);
        if (navigator.onLine) await offline.syncNow();
      } else {
        await post("/promotions/codes", { promotion_id: promotion.id, ...body });
      }
      formElement.reset();
      await codes.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Promotion code could not be added.");
    }
  }
  return (
    <Modal
      open
      title={`Configure Â· ${promotion.name}`}
      description="Without product scopes, this promotion applies to every eligible POS or repair order."
      onClose={onClose}
    >
      {error && <div className="form-error">{error}</div>}
      <section className="configuration-section">
        <h3>Product scope</h3>
        <Form className="inline-form" onSubmit={addScope}>
          <select
            name="product_id"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            required
          >
            <option value="">Select product</option>
            {products.data.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select name="variant_id" disabled={!productId}>
            <option value="">All product variants</option>
            {variants.data
              .filter((item) => item.product_id === productId)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <Button
            type="submit"
            icon="plus"
            disabled={offline.status === "offline" && !offline.storageAvailable}
          >
            Add
          </Button>
        </Form>
        {scopes.loading ? (
          <Loading />
        ) : scopes.data.length === 0 ? (
          <p className="configuration-empty">Applies to all products and service orders.</p>
        ) : (
          <div className="scope-chips">
            {scopes.data.map((item) => (
              <span key={item.id}>
                {item.product_name}
                {item.variant_name ? ` Â· ${item.variant_name}` : " Â· All variants"}
                <button
                  disabled={offline.status === "offline" && !offline.storageAvailable}
                  onClick={async () => {
                    if (
                      offline.status === "offline" &&
                      (!offline.scope || !offline.storageAvailable)
                    ) {
                      setError(
                        "Offline storage is required to remove promotion scopes while disconnected.",
                      );
                      return;
                    }
                    if (offline.scope && offline.storageAvailable) {
                      await queuePromotionScopeDelete(offline.scope, promotion, item);
                      if (navigator.onLine) await offline.syncNow();
                    } else await remove(`/promotions/products/${item.id}`);
                    await scopes.reload();
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>
      <section className="configuration-section">
        <h3>Promotion codes</h3>
        <Form className="inline-form" onSubmit={addCode}>
          <input name="code" required placeholder="SAVE10" />
          <input name="limit" type="number" min="1" placeholder="Usage limit" />
          <Button
            type="submit"
            icon="plus"
            disabled={offline.status === "offline" && !offline.storageAvailable}
          >
            Add
          </Button>
        </Form>
        {codes.loading ? (
          <Loading />
        ) : codes.data.length === 0 ? (
          <p className="configuration-empty">
            No code required; staff can select the promotion directly.
          </p>
        ) : (
          <div className="scope-chips">
            {codes.data.map((item) => (
              <span key={item.id}>
                {item.code} Â· {item.redemption_count} used
                <button
                  disabled={offline.status === "offline" && !offline.storageAvailable}
                  onClick={async () => {
                    if (
                      offline.status === "offline" &&
                      (!offline.scope || !offline.storageAvailable)
                    ) {
                      setError(
                        "Offline storage is required to remove promotion codes while disconnected.",
                      );
                      return;
                    }
                    if (offline.scope && offline.storageAvailable) {
                      await queuePromotionCodeDelete(offline.scope, promotion, item);
                      if (navigator.onLine) await offline.syncNow();
                    } else await remove(`/promotions/codes/${item.id}`);
                    await codes.reload();
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>
    </Modal>
  );
}

export function PromotionManager() {
  const { merchant } = useAuth();
  const offline = useOffline();
  const promotions = useResource<Promotion>("/promotions?page_index=0&page_size=100");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const visible = useMemo(
    () =>
      promotions.data
        .filter(
          (item) =>
            `${item.name} ${item.promotion_type}`.toLowerCase().includes(query.toLowerCase()) &&
            (filter === "ALL" ||
              (filter === "ACTIVE"
                ? item.is_active
                : filter === "INACTIVE"
                  ? !item.is_active
                  : item.promotion_type.includes(filter))),
        )
        .sort((a, b) =>
          sort === "NAME_DESC"
            ? b.name.localeCompare(a.name)
            : sort === "REDEMPTIONS_DESC"
              ? b.redemption_count - a.redemption_count
              : sort === "VALUE_DESC"
                ? Number(b.value) - Number(a.value)
                : a.name.localeCompare(b.name),
        ),
    [filter, promotions.data, query, sort],
  );
  const pagination = useListPagination(visible, 10, `${query}|${filter}|${sort}`);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [configuring, setConfiguring] = useState<Promotion | null>(null);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body = {
      name: String(values.get("name")).trim(),
      promotion_type: String(values.get("type")),
      value: String(values.get("value")),
      minimum_subtotal: String(values.get("minimum") || "0"),
      usage_limit: values.get("limit") ? Number(values.get("limit")) : undefined,
      starts_at: values.get("starts")
        ? new Date(String(values.get("starts"))).toISOString()
        : undefined,
      ends_at: values.get("ends") ? new Date(String(values.get("ends"))).toISOString() : undefined,
      is_active: values.get("active") === "on",
    };
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save promotions while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        if (editing) await queuePromotionUpdate(offline.scope, editing, body);
        else await queuePromotionCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) await patch(`/promotions/${editing.id}`, body);
      else await post("/promotions", body);
      setOpen(false);
      await promotions.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Promotion could not be saved.");
    }
  }
  async function destroy(item: Promotion) {
    if (confirm(`Delete ${item.name}? Existing redeemed orders remain unchanged.`)) {
      try {
        if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
          throw new Error("Offline storage is required to remove promotions while disconnected.");
        }
        if (offline.scope && offline.storageAvailable) {
          await queuePromotionDelete(offline.scope, item);
          if (navigator.onLine) await offline.syncNow();
        } else await remove(`/promotions/${item.id}`);
        await promotions.reload();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Promotion could not be deleted.");
      }
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Marketing"
        title="Promotions"
        description="Create discounts for POS and repair orders, optionally scoped to products or SKUs."
        action={
          <Button
            icon="plus"
            disabled={offline.status === "offline" && !offline.storageAvailable}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New promotion
          </Button>
        }
      />
      {error && <div className="form-error">{error}</div>}
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search promotions"
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter promotions"
        filterOptions={[
          { value: "ALL", label: "All promotions" },
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "Paused" },
          { value: "PERCENT", label: "Percentage" },
          { value: "FIXED", label: "Fixed amount" },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel="Sort promotions"
        sortOptions={[
          { value: "NAME_ASC", label: "Name A–Z" },
          { value: "NAME_DESC", label: "Name Z–A" },
          { value: "REDEMPTIONS_DESC", label: "Most redeemed" },
          { value: "VALUE_DESC", label: "Highest value" },
        ]}
      />
      <div className="promo-grid">
        {promotions.loading ? (
          <Loading />
        ) : promotions.error ? (
          <EmptyState title="Promotions could not load" message={promotions.error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="tag"
            title="No promotions"
            message="Create a percentage or fixed-amount discount."
          />
        ) : (
          pagination.pageItems.map((item) => (
            <article className="promo-card" key={item.id}>
              <div className="promo-card-head">
                <span>
                  <Icon name="tag" />
                </span>
                <Badge tone={item.is_active ? "success" : "neutral"}>
                  {item.is_active ? "Active" : "Paused"}
                </Badge>
              </div>
              <h2>{item.name}</h2>
              <strong>
                {item.promotion_type.includes("PERCENT")
                  ? `${item.value}%`
                  : `${formatMoney(item.value, merchant?.default_currency_code)}`}{" "}
                off
              </strong>
              <p>
                {Number(item.minimum_subtotal) > 0
                  ? `Minimum ${formatMoney(item.minimum_subtotal, merchant?.default_currency_code)}`
                  : "No minimum"}
              </p>
              <div className="promo-foot">
                <small>{item.redemption_count} redemptions</small>
                <div className="row-actions">
                  <button
                    title="Products and codes"
                    disabled={offline.status === "offline" && !offline.storageAvailable}
                    onClick={() => setConfiguring(item)}
                  >
                    <Icon name="catalog" size={15} />
                  </button>
                  <button
                    title="Edit"
                    disabled={offline.status === "offline" && !offline.storageAvailable}
                    onClick={() => {
                      setEditing(item);
                      setOpen(true);
                    }}
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    className="danger"
                    title="Delete"
                    disabled={offline.status === "offline" && !offline.storageAvailable}
                    onClick={() => destroy(item)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      <Pagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        itemLabel="promotions"
        onPageChange={pagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit promotion" : "New promotion"}
      >
        <Form onSubmit={save}>
          <div className="form-grid">
            <div className="wide">
              <Field label="Promotion name">
                <input name="name" defaultValue={editing?.name} required />
              </Field>
            </div>
            <Field label="Discount type">
              <select name="type" defaultValue={editing?.promotion_type ?? "PERCENTAGE"}>
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED_AMOUNT">Fixed amount</option>
              </select>
            </Field>
            <Field label="Value">
              <input
                name="value"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editing?.value}
                required
              />
            </Field>
            <Field label="Minimum subtotal">
              <input
                name="minimum"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editing?.minimum_subtotal ?? "0"}
              />
            </Field>
            <Field label="Usage limit">
              <input name="limit" type="number" min="1" defaultValue={editing?.usage_limit} />
            </Field>
            <Field label="Starts">
              <input name="starts" type="datetime-local" />
            </Field>
            <Field label="Ends">
              <input name="ends" type="datetime-local" />
            </Field>
            <label className="check-field wide">
              <input type="checkbox" name="active" defaultChecked={editing?.is_active ?? true} />
              <span>
                <strong>Promotion active</strong>
                <small>Available after date and usage validation</small>
              </span>
            </label>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={offline.status === "offline" && !offline.storageAvailable}
            >
              Save promotion
            </Button>
          </div>
        </Form>
      </Modal>
      {configuring && (
        <PromotionConfiguration promotion={configuring} onClose={() => setConfiguring(null)} />
      )}
    </>
  );
}
