"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useResource } from "@/lib/use-resource";
import { useShop } from "@/lib/shop";
import { useOffline } from "@/lib/offline";
import { useAuth } from "@/lib/auth";
import { queueDeliveryCreate, queueDeliveryDelete } from "@/lib/offline-deliveries";
import type { Customer, Delivery } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Form,
  ListControls,
  Loading,
  PageHeader,
  Pagination,
  useListPagination,
} from "./ui";
import { useTranslation } from "@/lib/i18n";

export function CustomersPage() {
  const { t } = useTranslation();
  const { isMerchant } = useAuth();
  const customers = useResource<Customer>("/customers?page_index=0&page_size=500");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers.data
      .filter(
        (item) =>
          !needle || `${item.display_name} ${item.phone ?? ""}`.toLowerCase().includes(needle),
      )
      .filter((item) => {
        if (filter === "WITH_SALES") return item.order_count > 0;
        if (filter === "WITH_REPAIRS") return item.repair_count > 0;
        if (filter === "NO_ACTIVITY") return item.order_count === 0 && item.repair_count === 0;
        return true;
      })
      .sort((left, right) =>
        sort === "NAME_DESC"
          ? right.display_name.localeCompare(left.display_name)
          : sort === "SALES_DESC"
            ? right.order_count - left.order_count ||
              left.display_name.localeCompare(right.display_name)
            : sort === "REPAIRS_DESC"
              ? right.repair_count - left.repair_count ||
                left.display_name.localeCompare(right.display_name)
              : left.display_name.localeCompare(right.display_name),
      );
  }, [customers.data, filter, query, sort]);
  const pagination = useListPagination(visible, 10, `${query}|${filter}|${sort}`);

  return (
    <>
      <PageHeader
        eyebrow={t("customers.eyebrow")}
        title={t("customers.title")}
        description={t("customers.description")}
      />
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder={t("common.search_placeholder")}
        filter={filter}
        onFilterChange={setFilter}
        filterLabel={t("common.filter")}
        filterOptions={[
          { value: "ALL", label: t("customers.all_customers") },
          { value: "WITH_SALES", label: t("customers.with_sales") },
          { value: "WITH_REPAIRS", label: t("customers.with_repairs") },
          { value: "NO_ACTIVITY", label: t("customers.no_activity") },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel={t("common.actions")}
        sortOptions={[
          { value: "NAME_ASC", label: `${t("common.name")} A–Z` },
          { value: "NAME_DESC", label: `${t("common.name")} Z–A` },
          { value: "SALES_DESC", label: t("customers.most_sales") },
          { value: "REPAIRS_DESC", label: t("customers.most_repairs") },
        ]}
      />
      <div className="table-card">
        {customers.loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="users"
            title={t("customers.no_customers_found")}
            message={
              query || filter !== "ALL"
                ? "No customer matches the current controls."
                : t("customers.no_customers_desc")
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("invoices.customer")}</th>
                <th>{t("common.phone")}</th>
                <th>{t("invoices.sales_invoices")}</th>
                <th>{t("invoices.repair_invoices")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.display_name}</strong>
                  </td>
                  <td>{item.phone || "—"}</td>
                  <td>{item.order_count}</td>
                  <td>{item.repair_count}</td>
                  <td>
                    {isMerchant ? (
                      <Link className="text-link" href={`/customers/${item.id}/edit`}>
                        {t("common.edit")}
                      </Link>
                    ) : (
                      <Badge tone="neutral">View only</Badge>
                    )}
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
        itemLabel={t("customers.title")}
        onPageChange={pagination.setPageIndex}
      />
    </>
  );
}

export function DeliveriesPage() {
  const { t } = useTranslation();
  const { currentShop } = useShop();
  const { isMerchant } = useAuth();
  const offline = useOffline();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const resource = useResource<Delivery>(
    currentShop ? `/shops/${currentShop.id}/deliveries?page_index=0&page_size=100` : "",
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return resource.data
      .filter(
        (item) =>
          !needle || `${item.name} ${item.contact_info ?? ""}`.toLowerCase().includes(needle),
      )
      .filter(
        (item) =>
          filter === "ALL" ||
          (filter === "WITH_CONTACT" ? Boolean(item.contact_info) : !item.contact_info),
      )
      .sort((left, right) =>
        sort === "NAME_DESC"
          ? right.name.localeCompare(left.name)
          : sort === "CONTACT_ASC"
            ? (left.contact_info ?? "").localeCompare(right.contact_info ?? "")
            : left.name.localeCompare(right.name),
      );
  }, [filter, query, resource.data, sort]);
  const pagination = useListPagination(visible, 10, `${query}|${filter}|${sort}`);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!currentShop || !name.trim() || !contact.trim()) return;
    try {
      if (!offline.scope || !offline.storageAvailable)
        throw new Error("Offline storage is required to safely save delivery options.");
      await queueDeliveryCreate(offline.scope, currentShop.id, name.trim(), contact.trim());
      setName("");
      setContact("");
      setMessage(
        navigator.onLine
          ? "Delivery saved locally; synchronizing..."
          : "Delivery saved locally and will sync when online.",
      );
      if (navigator.onLine) await offline.syncNow();
      await resource.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Delivery could not be saved.");
    }
  }

  async function deleteDelivery(item: Delivery) {
    try {
      if (!offline.scope || !offline.storageAvailable)
        throw new Error("Offline storage is required to safely remove delivery options.");
      const operation = await queueDeliveryDelete(offline.scope, item);
      setMessage(
        navigator.onLine
          ? "Removal saved locally; synchronizing..."
          : "Removal saved locally and will sync when online.",
      );
      if (navigator.onLine) {
        await offline.syncNow();
        if (operation.dependencyOperationId) await offline.syncNow();
      }
      await resource.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Delivery could not be removed.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={t("deliveries.eyebrow")}
        title={t("deliveries.title")}
        description={t("deliveries.description")}
      />
      <Form className="card form-grid" onSubmit={save}>
        <Field label={t("deliveries.delivery_name")}>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("deliveries.delivery_name")}
          />
        </Field>
        <Field label={t("deliveries.delivery_contact")}>
          <input
            required
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder={t("deliveries.delivery_contact")}
          />
        </Field>
        <div className="wide form-inline-actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "10px", flexWrap: "wrap" }}>
          <Button type="submit" icon="plus">{t("deliveries.save_delivery")}</Button>
          {message && <p className="notice" style={{ margin: 0 }}>{message}</p>}
        </div>
      </Form>
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder={t("common.search_placeholder")}
        filter={filter}
        onFilterChange={setFilter}
        filterLabel={t("common.filter")}
        filterOptions={[
          { value: "ALL", label: t("common.all") },
          { value: "WITH_CONTACT", label: t("deliveries.delivery_contact") },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel={t("common.actions")}
        sortOptions={[
          { value: "NAME_ASC", label: `${t("common.name")} A–Z` },
          { value: "NAME_DESC", label: `${t("common.name")} Z–A` },
        ]}
      />
      <div className="table-card">
        {resource.loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="package"
            title={t("deliveries.title")}
            message="No delivery option matches the current controls."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("deliveries.delivery_contact")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.contact_info || "—"}</td>
                  <td>
                    {isMerchant && (
                      <>
                        <Link className="text-link" href={`/deliveries/${item.id}/edit`}>
                          {t("common.edit")}
                        </Link>
                        {" · "}
                      </>
                    )}
                    <button className="text-link" onClick={() => void deleteDelivery(item)}>
                      {t("common.remove")}
                    </button>
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
        itemLabel={t("deliveries.title")}
        onPageChange={pagination.setPageIndex}
      />
    </>
  );
}
