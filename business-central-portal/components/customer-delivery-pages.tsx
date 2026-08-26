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

export function CustomersPage() {
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
        eyebrow="Customers"
        title="Customers"
        description="Customer records captured from sales and repair tickets."
      />
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search customers or phone"
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter customers"
        filterOptions={[
          { value: "ALL", label: "All customers" },
          { value: "WITH_SALES", label: "With sales" },
          { value: "WITH_REPAIRS", label: "With repairs" },
          { value: "NO_ACTIVITY", label: "No activity" },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel="Sort customers"
        sortOptions={[
          { value: "NAME_ASC", label: "Name A–Z" },
          { value: "NAME_DESC", label: "Name Z–A" },
          { value: "SALES_DESC", label: "Most sales" },
          { value: "REPAIRS_DESC", label: "Most repairs" },
        ]}
      />
      <div className="table-card">
        {customers.loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="users"
            title="No customers found"
            message={
              query || filter !== "ALL"
                ? "No customer matches the current controls."
                : "Customers appear automatically when a name and phone are entered at checkout or repair intake."
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Sales</th>
                <th>Repairs</th>
                <th>Access</th>
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
                        Edit
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
        itemLabel="customers"
        onPageChange={pagination.setPageIndex}
      />
    </>
  );
}

export function DeliveriesPage() {
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
        eyebrow="Operations"
        title="Deliveries"
        description="Manage delivery options for the active shop."
      />
      <Form className="card form-grid" onSubmit={save}>
        <Field label="Delivery name">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Courier or delivery service"
          />
        </Field>
        <Field label="Delivery contact info">
          <input
            required
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="Phone, URL or instructions"
          />
        </Field>
        <Button type="submit">Save delivery</Button>
        {message && <p className="notice">{message}</p>}
      </Form>
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search delivery options"
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter deliveries"
        filterOptions={[
          { value: "ALL", label: "All deliveries" },
          { value: "WITH_CONTACT", label: "With contact info" },
          { value: "WITHOUT_CONTACT", label: "Missing contact info" },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel="Sort deliveries"
        sortOptions={[
          { value: "NAME_ASC", label: "Name A–Z" },
          { value: "NAME_DESC", label: "Name Z–A" },
          { value: "CONTACT_ASC", label: "Contact A–Z" },
        ]}
      />
      <div className="table-card">
        {resource.loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="package"
            title="No deliveries found"
            message="No delivery option matches the current controls."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact info</th>
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
                          Edit
                        </Link>
                        {" · "}
                      </>
                    )}
                    <button className="text-link" onClick={() => void deleteDelivery(item)}>
                      Remove
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
        itemLabel="delivery options"
        onPageChange={pagination.setPageIndex}
      />
    </>
  );
}
