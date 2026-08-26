"use client";

import { FormEvent, useMemo, useState } from "react";
import { patch, post, remove } from "@/lib/api";
import { useOffline } from "@/lib/offline";
import { useAuth } from "@/lib/auth";
import {
  queueAttributeDefinitionCreate,
  queueAttributeDefinitionDelete,
  queueAttributeDefinitionUpdate,
  queueAttributeOptionCreate,
  queueAttributeOptionDelete,
  queueAttributeOptionUpdate,
} from "@/lib/offline-attributes";
import type { AttributeDefinitionMutation } from "@/lib/offline-attributes";
import { useResource } from "@/lib/use-resource";
import type { AttributeDefinition, AttributeOption } from "@/lib/types";
import { Icon } from "./icons";
import {
  Badge,
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

const attributesPath = "/catalog/attributes?page_index=0&page_size=100";

export function AttributeManager() {
  const offline = useOffline();
  const { merchant } = useAuth();
  const simple = merchant?.pos_complexity_level === "SIMPLE";
  const resource = useResource<AttributeDefinition>(attributesPath);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NAME_ASC");
  const visible = useMemo(
    () =>
      resource.data
        .filter(
          (item) =>
            `${item.name} ${item.code} ${item.options.map((option) => `${option.label} ${option.value}`).join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (filter === "ALL" || item.value_type === filter),
        )
        .sort((a, b) =>
          sort === "NAME_DESC"
            ? b.name.localeCompare(a.name)
            : sort === "CODE_ASC"
              ? a.code.localeCompare(b.code)
              : sort === "OPTIONS_DESC"
                ? b.options.length - a.options.length
                : a.name.localeCompare(b.name),
        ),
    [filter, query, resource.data, sort],
  );
  const pagination = useListPagination(visible, 10, `${query}|${filter}|${sort}`);
  const [definition, setDefinition] = useState<AttributeDefinition | null>(null);
  const [option, setOption] = useState<AttributeOption | null>(null);
  const [definitionFormOpen, setDefinitionFormOpen] = useState(false);
  const [optionFormOpen, setOptionFormOpen] = useState(false);
  const [optionDefinitionID, setOptionDefinitionID] = useState("");
  const [error, setError] = useState("");

  function ensureOfflineStorage() {
    if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
      throw new Error("Offline storage is required to save attributes while disconnected.");
    }
  }

  async function saveDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body: AttributeDefinitionMutation = {
      code: String(values.get("code") ?? "")
        .trim()
        .toUpperCase(),
      name: String(values.get("name") ?? "").trim(),
      value_type: String(
        values.get("value_type") ?? "SELECT",
      ) as AttributeDefinitionMutation["value_type"],
    };
    try {
      ensureOfflineStorage();
      if (offline.scope && offline.storageAvailable) {
        if (definition) await queueAttributeDefinitionUpdate(offline.scope, definition, body);
        else await queueAttributeDefinitionCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (definition) await patch(`/catalog/attributes/${definition.id}`, body);
      else await post("/catalog/attributes", body);
      setDefinitionFormOpen(false);
      setDefinition(null);
      await resource.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Attribute could not be saved.");
    }
  }

  async function saveOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const definitionID = String(values.get("definition_id") ?? optionDefinitionID);
    const body = {
      definition_id: definitionID,
      value: String(values.get("value") ?? "").trim(),
      label: String(values.get("label") ?? "").trim(),
      position: Number(values.get("position") ?? 0),
    };
    try {
      ensureOfflineStorage();
      if (offline.scope && offline.storageAvailable) {
        if (option) await queueAttributeOptionUpdate(offline.scope, option, body);
        else await queueAttributeOptionCreate(offline.scope, body);
        if (navigator.onLine) await offline.syncNow();
      } else if (option) await patch(`/catalog/attribute-options/${option.id}`, body);
      else await post(`/catalog/attributes/${definitionID}/options`, body);
      setOptionFormOpen(false);
      setOption(null);
      await resource.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Attribute option could not be saved.");
    }
  }

  async function deleteDefinition(item: AttributeDefinition) {
    if (!confirm(`Delete ${item.name}? Remove its options and assignments first.`)) return;
    if (item.options.length > 0) {
      setError("Remove this attribute's options before deleting the definition.");
      return;
    }
    try {
      ensureOfflineStorage();
      if (offline.scope && offline.storageAvailable) {
        await queueAttributeDefinitionDelete(offline.scope, item);
        if (navigator.onLine) await offline.syncNow();
      } else await remove(`/catalog/attributes/${item.id}`);
      await resource.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Attribute could not be deleted.");
    }
  }

  async function deleteOption(item: AttributeOption) {
    if (!confirm(`Delete option ${item.label}?`)) return;
    try {
      ensureOfflineStorage();
      if (offline.scope && offline.storageAvailable) {
        await queueAttributeOptionDelete(offline.scope, item);
        if (navigator.onLine) await offline.syncNow();
      } else await remove(`/catalog/attribute-options/${item.id}`);
      await resource.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Attribute option could not be deleted.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title={simple ? "Product attributes" : "Variant attributes"}
        description={
          simple
            ? "Set up reusable values such as Color, RAM, length, or storage to attach while creating products."
            : "Set up reusable values such as Color, RAM, length, or storage for sellable variants."
        }
        action={
          <Button
            icon="plus"
            onClick={() => {
              setDefinition(null);
              setError("");
              setDefinitionFormOpen(true);
            }}
          >
            New attribute
          </Button>
        }
      />
      {error && <div className="form-error">{error}</div>}
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search attributes or values"
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter attributes"
        filterOptions={[
          { value: "ALL", label: "All value types" },
          { value: "SELECT", label: "Select" },
          { value: "TEXT", label: "Text" },
          { value: "NUMBER", label: "Number" },
          { value: "BOOLEAN", label: "Boolean" },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel="Sort attributes"
        sortOptions={[
          { value: "NAME_ASC", label: "Name A–Z" },
          { value: "NAME_DESC", label: "Name Z–A" },
          { value: "CODE_ASC", label: "Code A–Z" },
          { value: "OPTIONS_DESC", label: "Most values" },
        ]}
      />
      <div className="table-card">
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <EmptyState title="Attributes could not load" message={resource.error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="tag"
            title={simple ? "No product attributes" : "No variant attributes"}
            message={
              simple
                ? "Create Color, RAM, length, or another property before attaching values to products."
                : "Create Color, RAM, length, or another property before adding variant values."
            }
            action={
              <Button
                onClick={() => {
                  setDefinition(null);
                  setDefinitionFormOpen(true);
                }}
              >
                Create first attribute
              </Button>
            }
          />
        ) : (
          <div className="attribute-definition-list">
            {pagination.pageItems.map((item) => (
              <section key={item.id} className="attribute-definition-row">
                <div className="attribute-definition-summary">
                  <span className="attribute-definition-icon">
                    {item.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="attribute-definition-copy">
                    <strong>{item.name}</strong>
                    <div className="attribute-definition-meta">
                      <code>{item.code}</code>
                      <span>{item.value_type.toLowerCase()}</span>
                    </div>
                  </div>
                  <Badge tone={item.options.length > 0 ? "info" : "neutral"}>
                    {item.options.length > 0 ? `${item.options.length} values` : "Free value"}
                  </Badge>
                  <div className="attribute-row-actions">
                    <button
                      type="button"
                      title="Edit attribute"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => {
                        setDefinition(item);
                        setError("");
                        setDefinitionFormOpen(true);
                      }}
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      type="button"
                      className="danger"
                      title="Delete attribute"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => deleteDefinition(item)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
                <div className="attribute-options">
                  <div className="attribute-options-head">
                    <div>
                      <strong>Values</strong>
                      <small>
                        {simple
                          ? "Choices available when creating a product"
                          : "Choices available when creating a variant"}
                      </small>
                    </div>
                    <Button
                      variant="ghost"
                      icon="plus"
                      onClick={() => {
                        setOption(null);
                        setOptionDefinitionID(item.id);
                        setOptionFormOpen(true);
                      }}
                    >
                      Add value
                    </Button>
                  </div>
                  {item.options.length === 0 ? (
                    <div className="attribute-options-empty">
                      No preset values. This attribute accepts a free value.
                    </div>
                  ) : (
                    <div className="attribute-option-list">
                      {item.options.map((itemOption) => (
                        <div className="attribute-option-row" key={itemOption.id}>
                          <span className="attribute-option-marker" />
                          <div>
                            <strong>{itemOption.label}</strong>
                            <small>{itemOption.value}</small>
                          </div>
                          <div className="attribute-row-actions">
                            <button
                              type="button"
                              title={`Edit ${itemOption.label}`}
                              aria-label={`Edit ${itemOption.label}`}
                              onClick={() => {
                                setOption(itemOption);
                                setOptionDefinitionID(item.id);
                                setOptionFormOpen(true);
                              }}
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              type="button"
                              className="danger"
                              title={`Delete ${itemOption.label}`}
                              aria-label={`Delete ${itemOption.label}`}
                              onClick={() => deleteOption(itemOption)}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <Pagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        itemLabel="attributes"
        onPageChange={pagination.setPageIndex}
      />
      <Modal
        open={definitionFormOpen}
        onClose={() => setDefinitionFormOpen(false)}
        title={
          definition ? "Edit attribute" : simple ? "New product attribute" : "New variant attribute"
        }
      >
        <Form onSubmit={saveDefinition}>
          <div className="form-grid">
            <Field label="Code" hint="Use a stable code such as COLOR or RAM_GB.">
              <input
                name="code"
                defaultValue={definition?.code}
                readOnly={Boolean(definition)}
                required
              />
            </Field>
            <Field label="Display name">
              <input name="name" defaultValue={definition?.name} placeholder="Color" required />
            </Field>
            <Field label="Value type">
              <select
                name="value_type"
                defaultValue={definition?.value_type ?? "SELECT"}
                disabled={Boolean(definition?.options.length)}
              >
                <option value="SELECT">Select from options</option>
                <option value="TEXT">Text</option>
                <option value="NUMBER">Number</option>
                <option value="BOOLEAN">Yes or no</option>
                <option value="DATE">Date</option>
                <option value="JSON">JSON</option>
              </select>
              {definition?.options.length ? (
                <input type="hidden" name="value_type" value={definition.value_type} readOnly />
              ) : null}
            </Field>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setDefinitionFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save attribute</Button>
          </div>
        </Form>
      </Modal>
      <Modal
        open={optionFormOpen}
        onClose={() => setOptionFormOpen(false)}
        title={option ? "Edit attribute value" : "New attribute value"}
      >
        <Form onSubmit={saveOption}>
          <div className="form-grid">
            <Field
              label="Value"
              hint={
                simple
                  ? "Stored value used by integrations and product attachments."
                  : "Stored value used by integrations and variant attributes."
              }
            >
              <input name="value" defaultValue={option?.value} required />
            </Field>
            <Field label="Display label">
              <input name="label" defaultValue={option?.label} required />
            </Field>
            <Field label="Position">
              <input name="position" type="number" min="0" defaultValue={option?.position ?? 0} />
            </Field>
            <input
              type="hidden"
              name="definition_id"
              value={option?.definition_id ?? optionDefinitionID}
              readOnly
            />
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOptionFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save option</Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
