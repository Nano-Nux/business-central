"use client";

import { FormEvent, useMemo, useState } from "react";
import { patch, post, remove } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { Brand } from "@/lib/types";
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
  useListPagination,
} from "./ui";
import { Icon } from "./icons";

export function BrandsPage() {
  const brands = useResource<Brand>("/catalog/brands?page_index=0&page_size=200");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return brands.data
      .filter(
        (brand) =>
          !needle ||
          `${brand.name} ${brand.slug} ${brand.description ?? ""}`.toLowerCase().includes(needle),
      )
      .filter(
        (brand) =>
          filter === "ALL" ||
          (filter === "WITH_DESCRIPTION" ? Boolean(brand.description) : !brand.description),
      )
      .sort((left, right) =>
        sort === "NAME_DESC"
          ? right.name.localeCompare(left.name)
          : sort === "SLUG_ASC"
            ? left.slug.localeCompare(right.slug)
            : left.name.localeCompare(right.name),
      );
  }, [brands.data, filter, query, sort]);
  const pagination = useListPagination(visible, 10, `${query}|${filter}|${sort}`);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const body = {
      name: String(values.get("name")).trim(),
      slug: String(values.get("slug")).trim().toLowerCase(),
      description: String(values.get("description") || "").trim() || undefined,
    };
    try {
      if (editing) await patch(`/catalog/brands/${editing.id}`, body);
      else await post("/catalog/brands", body);
      setOpen(false);
      setEditing(null);
      await brands.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Brand could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy(brand: Brand) {
    if (!confirm(`Delete ${brand.name}?`)) return;
    try {
      await remove(`/catalog/brands/${brand.id}`);
      await brands.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Brand could not be deleted.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Brands"
        description="Manage the brands available when creating products."
        action={
          <Button
            icon="plus"
            onClick={() => {
              setEditing(null);
              setError("");
              setOpen(true);
            }}
          >
            New brand
          </Button>
        }
      />
      {error && <div className="form-error">{error}</div>}
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search brands"
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter brands"
        filterOptions={[
          { value: "ALL", label: "All brands" },
          { value: "WITH_DESCRIPTION", label: "With description" },
          { value: "WITHOUT_DESCRIPTION", label: "Without description" },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel="Sort brands"
        sortOptions={[
          { value: "NAME_ASC", label: "Name A–Z" },
          { value: "NAME_DESC", label: "Name Z–A" },
          { value: "SLUG_ASC", label: "Slug A–Z" },
        ]}
      />
      <div className="table-card">
        {brands.loading ? (
          <Loading />
        ) : brands.error ? (
          <EmptyState title="Brands could not load" message={brands.error} />
        ) : visible.length === 0 ? (
          <EmptyState icon="tag" title="No brands found" message="Create your first brand." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Slug</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((brand) => (
                <tr key={brand.id}>
                  <td>
                    <strong>{brand.name}</strong>
                  </td>
                  <td>/{brand.slug}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        title="Edit"
                        onClick={() => {
                          setEditing(brand);
                          setError("");
                          setOpen(true);
                        }}
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="danger" title="Delete" onClick={() => destroy(brand)}>
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
        itemLabel="brands"
        onPageChange={pagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit brand" : "New brand"}
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
              {busy ? "Saving…" : "Save brand"}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
