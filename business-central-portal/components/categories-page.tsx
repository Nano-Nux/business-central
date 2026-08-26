"use client";

import { FormEvent, useMemo, useState, type CSSProperties } from "react";
import { patch, post, remove } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useOffline } from "@/lib/offline";
import {
  queueCategoryCreate,
  queueCategoryDelete,
  queueCategoryUpdate,
} from "@/lib/offline-categories";
import type { Category } from "@/lib/types";
import { Icon } from "./icons";
import {
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

export function CategoriesPage() {
  const offline = useOffline();
  const categories = useResource<Category>("/catalog/categories?page_index=0&page_size=200");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("HIERARCHY");
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const byId = new Map(categories.data.map((item) => [item.id, item]));
    const included = new Set<string>();
    if (!normalizedQuery) {
      categories.data.forEach((item) => included.add(item.id));
    } else {
      categories.data.forEach((item) => {
        if (`${item.name} ${item.slug}`.toLowerCase().includes(normalizedQuery)) {
          let current: Category | undefined = item;
          while (current && !included.has(current.id)) {
            included.add(current.id);
            current = current.parent_category_id ? byId.get(current.parent_category_id) : undefined;
          }
        }
      });
    }
    const children = new Map<string, Category[]>();
    categories.data.forEach((item) => {
      const parentID = item.parent_category_id ?? "";
      const siblings = children.get(parentID) ?? [];
      siblings.push(item);
      children.set(parentID, siblings);
    });
    children.forEach((siblings) =>
      siblings.sort(
        (left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name),
      ),
    );
    const rows: Array<{ item: Category; depth: number }> = [];
    const flatten = (parentID: string, depth: number, path: Set<string>) => {
      (children.get(parentID) ?? []).forEach((item) => {
        if (!included.has(item.id) || path.has(item.id)) return;
        rows.push({ item, depth });
        flatten(item.id, depth + 1, new Set(path).add(item.id));
      });
    };
    flatten("", 0, new Set());
    const filtered = rows.filter(
      ({ depth }) => filter === "ALL" || (filter === "TOP_LEVEL" ? depth === 0 : depth > 0),
    );
    if (sort === "NAME_ASC")
      filtered.sort((left, right) => left.item.name.localeCompare(right.item.name));
    if (sort === "NAME_DESC")
      filtered.sort((left, right) => right.item.name.localeCompare(left.item.name));
    if (sort === "ORDER_ASC")
      filtered.sort(
        (left, right) =>
          left.item.sort_order - right.item.sort_order ||
          left.item.name.localeCompare(right.item.name),
      );
    return filtered;
  }, [categories.data, filter, query, sort]);
  const pagination = useListPagination(visible, 10, `${query}|${filter}|${sort}`);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name")),
      slug: String(form.get("slug")).toLowerCase(),
      parent_category_id: String(form.get("parent") || "") || undefined,
      description: String(form.get("description") || "") || undefined,
      sort_order: Number(form.get("sort_order") || 0),
    };
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save categories while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        if (editing) await queueCategoryUpdate(offline.scope, editing, body);
        else await queueCategoryCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (editing) await patch(`/catalog/categories/${editing.id}`, body);
      else await post("/catalog/categories", body);
      setOpen(false);
      setEditing(null);
      await categories.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Category could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function destroy(item: Category) {
    if (!confirm(`Delete ${item.name}? Products assigned to it will be unlinked.`)) return;
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to remove categories while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queueCategoryDelete(offline.scope, item);
        if (navigator.onLine) await offline.syncNow();
      } else {
        await remove(`/catalog/categories/${item.id}`);
      }
      await categories.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Category could not be deleted.");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Categories"
        description="Organize products into a simple, searchable hierarchy."
        action={
          <Button
            icon="plus"
            disabled={offline.status === "offline" && !offline.storageAvailable}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New category
          </Button>
        }
      />
      {error && <div className="form-error">{error}</div>}
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search categories…"
          />
        </div>
        <select
          className="filter-select"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter categories"
        >
          <option value="ALL">All categories</option>
          <option value="TOP_LEVEL">Top level</option>
          <option value="CHILDREN">Subcategories</option>
        </select>
        <select
          className="filter-select"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort categories"
        >
          <option value="HIERARCHY">Hierarchy order</option>
          <option value="NAME_ASC">Name A–Z</option>
          <option value="NAME_DESC">Name Z–A</option>
          <option value="ORDER_ASC">Sort order</option>
        </select>
      </div>
      <div className="table-card">
        {categories.loading ? (
          <Loading />
        ) : categories.error ? (
          <EmptyState title="Categories could not load" message={categories.error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="catalog"
            title="No categories found"
            message={
              query ? "No category matches this search." : "Create your first product category."
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Parent</th>
                <th>Order</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map(({ item, depth }) => (
                <tr key={item.id}>
                  <td>
                    <div
                      className={`category-tree-node ${depth > 0 ? "is-child" : ""}`}
                      style={
                        {
                          paddingLeft: `${depth * 24}px`,
                          "--category-depth": depth,
                        } as CSSProperties
                      }
                    >
                      <span className="category-tree-marker" aria-hidden="true">
                        {depth > 0 ? "└" : "●"}
                      </span>
                      <div className="cell-main">
                        <strong>{item.name}</strong>
                        <small>
                          /{item.slug}
                          {item.description ? ` · ${item.description}` : ""}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {categories.data.find((parent) => parent.id === item.parent_category_id)
                      ?.name ?? "Top level"}
                  </td>
                  <td>{item.sort_order}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        title="Edit"
                        onClick={() => {
                          setEditing(item);
                          setOpen(true);
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
        itemLabel="categories"
        onPageChange={pagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit category" : "New category"}
      >
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field label="Name">
              <input name="name" defaultValue={editing?.name} required />
            </Field>
            <Field label="URL slug">
              <input
                name="slug"
                defaultValue={editing?.slug}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />
            </Field>
            <Field label="Parent category">
              <select name="parent" defaultValue={editing?.parent_category_id ?? ""}>
                <option value="">Top level</option>
                {categories.data
                  .filter((item) => item.id !== editing?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Sort order">
              <input
                name="sort_order"
                type="number"
                min="0"
                defaultValue={editing?.sort_order ?? 0}
              />
            </Field>
            <div className="wide">
              <Field label="Description">
                <textarea name="description" defaultValue={editing?.description} />
              </Field>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save category"}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
