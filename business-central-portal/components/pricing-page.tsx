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
import { api, patch, post, remove } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import type { PriceList, ProductPrice, Variant } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import { currencyLabel, formatMoney } from "@/lib/currency";
import { priceSyncID, queuePriceDelete, queuePriceUpsert } from "@/lib/offline-pricing";
import {
  queuePriceListCreate,
  queuePriceListDelete,
  queuePriceListUpdate,
} from "@/lib/offline-price-lists";

function Prices({ list }: { list: PriceList }) {
  const offline = useOffline();
  const { merchant } = useAuth();
  const simple = merchant?.pos_complexity_level === "SIMPLE";
  const prices = useResource<ProductPrice>(
    `/pricing/price-lists/${list.id}/prices?page_index=0&page_size=200`,
  );
  const [priceQuery, setPriceQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState("ALL");
  const [priceSort, setPriceSort] = useState("PRODUCT_ASC");
  const [priceReferenceTime] = useState(() => Date.now());
  const variants = useResource<Variant>("/pos/catalog?page_index=0&page_size=200");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProductPrice | null>(null);
  const [error, setError] = useState("");
  const variantName = (id: string) => {
    const variant = variants.data.find((item) => item.id === id);
    return variant
      ? simple
        ? (variant.product_name ?? variant.name)
        : `${variant.name} · ${variant.sku}`
      : id;
  };
  const variantLabels = useMemo(
    () =>
      new Map(
        variants.data.map((variant) => [
          variant.id,
          simple ? (variant.product_name ?? variant.name) : `${variant.name} · ${variant.sku}`,
        ]),
      ),
    [simple, variants.data],
  );
  const visiblePrices = useMemo(
    () =>
      prices.data
        .filter(
          (item) =>
            (variantLabels.get(item.variant_id) ?? item.variant_id)
              .toLowerCase()
              .includes(priceQuery.toLowerCase()) &&
            (priceFilter === "ALL" ||
              (priceFilter === "CURRENT"
                ? new Date(item.valid_from).getTime() <= priceReferenceTime &&
                  (!item.valid_until || new Date(item.valid_until).getTime() >= priceReferenceTime)
                : priceFilter === "FUTURE"
                  ? new Date(item.valid_from).getTime() > priceReferenceTime
                  : !!item.valid_until &&
                    new Date(item.valid_until).getTime() < priceReferenceTime)),
        )
        .sort((a, b) =>
          priceSort === "PRODUCT_DESC"
            ? (variantLabels.get(b.variant_id) ?? "").localeCompare(
                variantLabels.get(a.variant_id) ?? "",
              )
            : priceSort === "AMOUNT_ASC"
              ? Number(a.amount) - Number(b.amount)
              : priceSort === "AMOUNT_DESC"
                ? Number(b.amount) - Number(a.amount)
                : (variantLabels.get(a.variant_id) ?? "").localeCompare(
                    variantLabels.get(b.variant_id) ?? "",
                  ),
        ),
    [priceFilter, priceQuery, priceReferenceTime, priceSort, prices.data, variantLabels],
  );
  const pricePagination = useListPagination(
    visiblePrices,
    10,
    `${priceQuery}|${priceFilter}|${priceSort}`,
  );
  const pricedVariantIDs = new Set(prices.data.map((item) => item.variant_id));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const validFrom = selected?.valid_from ?? new Date().toISOString();
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save prices while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        const variantID = String(values.get("variant_id"));
        const syncID =
          selected?.sync_id ??
          (await priceSyncID(offline.scope.merchantId, list.id, variantID, validFrom));
        await queuePriceUpsert(
          offline.scope,
          {
            sync_id: syncID,
            price_list_id: list.id,
            variant_id: variantID,
            amount: String(values.get("amount")),
            valid_from: validFrom,
          },
          selected ?? undefined,
        );
        if (navigator.onLine) await offline.syncNow();
      } else
        await post("/pricing/prices", {
          price_list_id: list.id,
          variant_id: String(values.get("variant_id")),
          amount: String(values.get("amount")),
          valid_from: validFrom,
        });
      setOpen(false);
      setSelected(null);
      await prices.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Price could not be saved.");
    }
  }
  async function destroy(item: ProductPrice) {
    if (
      !confirm(
        `Remove the ${formatMoney(item.amount, list.currency_code)} price for ${variantName(item.variant_id)}?`,
      )
    )
      return;
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to remove prices while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queuePriceDelete(offline.scope, item);
        if (navigator.onLine) await offline.syncNow();
      } else
        await api<void>("/pricing/prices", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
      await prices.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Price could not be removed.");
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{list.code}</h2>
          <p>
            {currencyLabel(list.currency_code)} {list.is_default ? "· Used by POS" : ""}
          </p>
        </div>
        <Button
          icon="plus"
          disabled={offline.status === "offline" && !offline.storageAvailable}
          onClick={() => {
            setSelected(null);
            setOpen(true);
          }}
        >
          Set price
        </Button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <ListControls
        search={priceQuery}
        onSearchChange={setPriceQuery}
        searchPlaceholder="Search products or variants"
        filter={priceFilter}
        onFilterChange={setPriceFilter}
        filterLabel={`Filter ${list.code} prices`}
        filterOptions={[
          { value: "ALL", label: "All prices" },
          { value: "CURRENT", label: "Current" },
          { value: "FUTURE", label: "Scheduled" },
          { value: "EXPIRED", label: "Expired" },
        ]}
        sort={priceSort}
        onSortChange={setPriceSort}
        sortLabel={`Sort ${list.code} prices`}
        sortOptions={[
          { value: "PRODUCT_ASC", label: "Product A–Z" },
          { value: "PRODUCT_DESC", label: "Product Z–A" },
          { value: "AMOUNT_ASC", label: "Lowest price" },
          { value: "AMOUNT_DESC", label: "Highest price" },
        ]}
      />
      {prices.loading ? (
        <Loading />
      ) : visiblePrices.length === 0 ? (
        <EmptyState
          icon="tag"
          title="No prices in this list"
          message={
            simple
              ? "Set a product price before it can be sold through POS."
              : "Set a variant price before it can be sold through POS."
          }
        />
      ) : (
        <div className="variant-list">
          {pricePagination.pageItems.map((item) => (
            <div key={`${item.variant_id}-${item.valid_from}`}>
              <span className="stat-icon amber">
                <Icon name="tag" size={16} />
              </span>
              <div>
                <strong>{variantName(item.variant_id)}</strong>
                <small>
                  Valid from{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                  }).format(new Date(item.valid_from))}
                </small>
              </div>
              <b>{formatMoney(item.amount, list.currency_code)}</b>
              <div className="row-actions">
                <button
                  onClick={() => {
                    setSelected(item);
                    setOpen(true);
                  }}
                >
                  <Icon name="edit" size={15} />
                </button>
                <button className="danger" onClick={() => destroy(item)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination
        pageIndex={pricePagination.pageIndex}
        pageSize={pricePagination.pageSize}
        totalItems={pricePagination.totalItems}
        totalPages={pricePagination.totalPages}
        itemLabel="prices"
        onPageChange={pricePagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={selected ? "Update price" : "Set product price"}
      >
        <Form onSubmit={save}>
          <Field label={simple ? "Product" : "Variant"}>
            <select
              name="variant_id"
              defaultValue={selected?.variant_id}
              disabled={!!selected}
              required
            >
              <option value="">{simple ? "Select product" : "Select SKU"}</option>
              {variants.data
                .filter(
                  (item) => selected?.variant_id === item.id || !pricedVariantIDs.has(item.id),
                )
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {simple ? (item.product_name ?? item.name) : `${item.name} · ${item.sku}`}
                  </option>
                ))}
            </select>
            {selected && <input type="hidden" name="variant_id" value={selected.variant_id} />}
          </Field>
          <Field label={`Amount (${currencyLabel(list.currency_code)})`}>
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={selected?.amount}
              required
            />
          </Field>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save price</Button>
          </div>
        </Form>
      </Modal>
    </section>
  );
}

export function PricingPage() {
  const { merchant } = useAuth();
  const offline = useOffline();
  const lists = useResource<PriceList>("/pricing/price-lists?page_index=0&page_size=100");
  const [listQuery, setListQuery] = useState("");
  const [listFilter, setListFilter] = useState("ALL");
  const [listSort, setListSort] = useState("CODE_ASC");
  const visibleLists = useMemo(
    () =>
      lists.data
        .filter(
          (item) =>
            `${item.code} ${item.currency_code}`.toLowerCase().includes(listQuery.toLowerCase()) &&
            (listFilter === "ALL" ||
              (listFilter === "DEFAULT" ? item.is_default : !item.is_default)),
        )
        .sort((a, b) =>
          listSort === "CODE_DESC"
            ? b.code.localeCompare(a.code)
            : listSort === "CURRENCY"
              ? a.currency_code.localeCompare(b.currency_code)
              : a.code.localeCompare(b.code),
        ),
    [listFilter, listQuery, listSort, lists.data],
  );
  const listPagination = useListPagination(
    visibleLists,
    10,
    `${listQuery}|${listFilter}|${listSort}`,
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body = {
      code: String(values.get("code")).trim().toUpperCase(),
      currency_code: String(values.get("currency")),
      is_default: values.get("default") === "on",
    };
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save price lists while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        if (editing) await queuePriceListUpdate(offline.scope, editing, body);
        else await queuePriceListCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) await patch(`/pricing/price-lists/${editing.id}`, body);
      else await post("/pricing/price-lists", body);
      setOpen(false);
      await lists.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Price list could not be saved.");
    }
  }
  async function destroy(item: PriceList) {
    if (confirm(`Delete price list ${item.code}?`)) {
      try {
        if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
          throw new Error("Offline storage is required to remove price lists while disconnected.");
        }
        if (offline.scope && offline.storageAvailable) {
          await queuePriceListDelete(offline.scope, item);
          if (navigator.onLine) await offline.syncNow();
        } else await remove(`/pricing/price-lists/${item.id}`);
        await lists.reload();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Price list could not be deleted.");
      }
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Pricing"
        description="Set the authoritative prices used by POS and reporting."
        action={
          <Button
            icon="plus"
            disabled={offline.status === "offline" && !offline.storageAvailable}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New price list
          </Button>
        }
      />
      {error && <div className="form-error">{error}</div>}
      <ListControls
        search={listQuery}
        onSearchChange={setListQuery}
        searchPlaceholder="Search price lists or currency"
        filter={listFilter}
        onFilterChange={setListFilter}
        filterLabel="Filter price lists"
        filterOptions={[
          { value: "ALL", label: "All price lists" },
          { value: "DEFAULT", label: "Default" },
          { value: "ADDITIONAL", label: "Additional" },
        ]}
        sort={listSort}
        onSortChange={setListSort}
        sortLabel="Sort price lists"
        sortOptions={[
          { value: "CODE_ASC", label: "Code A–Z" },
          { value: "CODE_DESC", label: "Code Z–A" },
          { value: "CURRENCY", label: "Currency" },
        ]}
      />
      {lists.loading ? (
        <Loading />
      ) : lists.error ? (
        <EmptyState title="Pricing could not load" message={lists.error} />
      ) : visibleLists.length === 0 ? (
        <EmptyState
          icon="tag"
          title="No price lists"
          message="Create a default price list in the merchant currency before selling products."
        />
      ) : (
        <div className="settings-stack">
          {listPagination.pageItems.map((list) => (
            <div key={list.id}>
              <div className="price-list-actions">
                <Badge tone={list.is_default ? "success" : "neutral"}>
                  {list.is_default ? "Default" : "Additional"}
                </Badge>
                <button
                  onClick={() => {
                    setEditing(list);
                    setOpen(true);
                  }}
                >
                  <Icon name="edit" size={15} />
                </button>
                <button onClick={() => destroy(list)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <Prices list={list} />
            </div>
          ))}
        </div>
      )}
      <Pagination
        pageIndex={listPagination.pageIndex}
        pageSize={listPagination.pageSize}
        totalItems={listPagination.totalItems}
        totalPages={listPagination.totalPages}
        itemLabel="price lists"
        onPageChange={listPagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit price list" : "New price list"}
      >
        <Form onSubmit={save}>
          <Field label="Code">
            <select name="code" defaultValue={editing?.code ?? "RETAIL"} required>
              <option value="RETAIL">RETAIL — normal POS prices</option>
              <option value="WHOLESALE">WHOLESALE — bulk customer prices</option>
              <option value="ONLINE">ONLINE — website prices</option>
              <option value="VIP">VIP — special customer prices</option>
            </select>
          </Field>
          <Field label="Currency">
            <input
              name="currency"
              defaultValue={editing?.currency_code ?? merchant?.default_currency_code}
              required
              maxLength={3}
            />
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              name="default"
              defaultChecked={
                editing?.is_default ?? !lists.data.some((list) => list.code === "RETAIL")
              }
            />
            <span>
              <strong>Default POS price list</strong>
              <small>Only one list can be the merchant default</small>
            </span>
          </label>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save price list</Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
