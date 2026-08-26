"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  Field,
  Form,
  ListControls,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  StatusBadge,
  useListPagination,
} from "./ui";
import { patch, post, remove } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useOffline } from "@/lib/offline";
import {
  queueRepairServiceCreate,
  queueRepairServiceDelete,
  queueRepairServiceUpdate,
} from "@/lib/offline-repair-catalog";

type Service = {
  id: string;
  code: string;
  name: string;
  description?: string;
  labor_fee: string;
  is_active: boolean;
};

export function RepairCatalogPage() {
  const offline = useOffline();
  const services = useResource<Service>("/services/catalog?page_index=0&page_size=100");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const visible = useMemo(
    () =>
      services.data
        .filter(
          (item) =>
            `${item.name} ${item.code} ${item.description ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (filter === "ALL" || (filter === "ACTIVE" ? item.is_active : !item.is_active)),
        )
        .sort((a, b) =>
          sort === "NAME_DESC"
            ? b.name.localeCompare(a.name)
            : sort === "FEE_ASC"
              ? Number(a.labor_fee) - Number(b.labor_fee)
              : sort === "FEE_DESC"
                ? Number(b.labor_fee) - Number(a.labor_fee)
                : a.name.localeCompare(b.name),
        ),
    [filter, query, services.data, sort],
  );
  const pagination = useListPagination(visible, 10, `${query}|${filter}|${sort}`);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const data = {
      code: String(values.get("code")),
      name: String(values.get("name")),
      description: String(values.get("description") || "") || undefined,
      labor_fee: String(values.get("labor_fee") || "0"),
      is_active: values.get("active") === "on",
    };
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save repair services while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        if (editing) await queueRepairServiceUpdate(offline.scope, editing, data);
        else await queueRepairServiceCreate(offline.scope, data);
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) await patch(`/services/catalog/${editing.id}`, data);
      else await post("/services/catalog", data);
      setOpen(false);
      setEditing(null);
      await services.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Catalog item could not be saved.");
    }
  }
  async function destroy(item: Service) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error(
          "Offline storage is required to remove repair services while disconnected.",
        );
      }
      if (offline.scope && offline.storageAvailable) {
        await queueRepairServiceDelete(offline.scope, item);
        if (navigator.onLine) await offline.syncNow();
      } else await remove(`/services/catalog/${item.id}`);
      await services.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Catalog item could not be deleted.");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Repairs"
        title="Repair catalog"
        description="Manage repair services and their default labor fees."
        action={
          <Button
            icon="plus"
            disabled={offline.status === "offline" && !offline.storageAvailable}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New repair service
          </Button>
        }
      />
      {error && <div className="form-error">{error}</div>}
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search service, code or description"
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter repair services"
        filterOptions={[
          { value: "ALL", label: "All services" },
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "Inactive" },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel="Sort repair services"
        sortOptions={[
          { value: "NAME_ASC", label: "Name A–Z" },
          { value: "NAME_DESC", label: "Name Z–A" },
          { value: "FEE_ASC", label: "Lowest fee" },
          { value: "FEE_DESC", label: "Highest fee" },
        ]}
      />
      <div className="table-card">
        {services.loading ? (
          <Loading />
        ) : services.error ? (
          <EmptyState title="Catalog could not load" message={services.error} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No repair services"
            message="Add common jobs such as screen, battery or software work."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Code</th>
                <th>Labor fee</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <br />
                    <small>{item.description}</small>
                  </td>
                  <td>{item.code}</td>
                  <td>{item.labor_fee}</td>
                  <td>
                    <StatusBadge status={item.is_active ? "ACTIVE" : "INACTIVE"} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        disabled={offline.status === "offline" && !offline.storageAvailable}
                        onClick={() => {
                          setEditing(item);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        disabled={offline.status === "offline" && !offline.storageAvailable}
                        onClick={() => destroy(item)}
                      >
                        Delete
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
        itemLabel="services"
        onPageChange={pagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit repair service" : "New repair service"}
        description="Catalogs are shared by the merchant; use a shop-specific price list when shops need different fees."
      >
        <Form onSubmit={save}>
          <Field label="Code">
            <input name="code" required defaultValue={editing?.code} />
          </Field>
          <Field label="Service name">
            <input name="name" required defaultValue={editing?.name} />
          </Field>
          <Field label="Description">
            <textarea name="description" defaultValue={editing?.description} />
          </Field>
          <Field label="Labor fee">
            <input
              name="labor_fee"
              type="number"
              min="0"
              step="0.01"
              defaultValue={editing?.labor_fee ?? "0"}
              required
            />
          </Field>
          <label className="check-field">
            <input name="active" type="checkbox" defaultChecked={editing?.is_active ?? true} />
            <span>Active</span>
          </label>
          <Button
            type="submit"
            disabled={offline.status === "offline" && !offline.storageAvailable}
          >
            Save service
          </Button>
        </Form>
      </Modal>
    </>
  );
}
