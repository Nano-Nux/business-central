"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { patch, post, remove } from "@/lib/api";
import { useOffline } from "@/lib/offline";
import { useResource } from "@/lib/use-resource";
import { useShop } from "@/lib/shop";
import { useAuth } from "@/lib/auth";
import type { RepairPreset } from "@/lib/types";
import {
  filterAndSortPresets,
  PRESET_SORT_OPTIONS,
  PresetSortOption,
  STARTER_PRESET_TEMPLATES,
  validatePresetValue,
} from "@/lib/repair-presets";
import { Icon } from "./icons";
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
  StatCard,
  useListPagination,
} from "./ui";

export function RepairPresetsPage({ type }: { type: "ISSUE" | "CONDITION" }) {
  const { currentShop } = useShop();
  const { merchant } = useAuth();
  const mini = merchant?.pos_complexity_level === "MINI";
  const offline = useOffline();

  // Search, filter, and sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<PresetSortOption>("NEWEST");
  const [showTemplates, setShowTemplates] = useState(true);

  // Modal and editing states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<RepairPreset | null>(null);
  const [presetValueInput, setPresetValueInput] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation modal state
  const [deleteConfirmPreset, setDeleteConfirmPreset] = useState<RepairPreset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback notifications
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const label = type === "ISSUE" ? "Issue" : "Condition";
  const path = currentShop
    ? `/repairs/presets?shop_id=${encodeURIComponent(currentShop.id)}&preset_type=${type}&page_index=0&page_size=200`
    : "";
  const presets = useResource<RepairPreset>(path);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Filter and sort items
  const filteredPresets = useMemo(
    () => filterAndSortPresets(presets.data, searchQuery, sortOption),
    [presets.data, searchQuery, sortOption],
  );

  const pagination = useListPagination(filteredPresets, 12, `${type}|${searchQuery}|${sortOption}`);

  // Modal opener
  function openCreateModal(initialValue = "") {
    setEditingPreset(null);
    setPresetValueInput(initialValue);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEditModal(preset: RepairPreset) {
    setEditingPreset(preset);
    setPresetValueInput(preset.value);
    setFormError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingPreset(null);
    setPresetValueInput("");
    setFormError("");
  }

  // Create or Update Preset
  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentShop) {
      setFormError("No active shop selected.");
      return;
    }

    if (offline.status === "offline") {
      setFormError("Connect to the network to manage repair presets.");
      return;
    }

    const validation = validatePresetValue(presetValueInput, presets.data, editingPreset?.id);

    if (!validation.valid) {
      setFormError(validation.error ?? "Invalid preset value.");
      return;
    }

    const body = {
      shop_id: currentShop.id,
      preset_type: type,
      value: validation.cleanValue,
    };

    setIsSubmitting(true);
    setFormError("");

    try {
      if (editingPreset) {
        await patch(`/repairs/presets/${editingPreset.id}`, body);
        setToastMessage({ text: `${label} preset updated successfully.` });
      } else {
        await post("/repairs/presets", body);
        setToastMessage({ text: `${label} preset added successfully.` });
      }
      closeModal();
      await presets.reload();
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : `${label} preset could not be saved.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Delete Preset
  async function handleDelete() {
    if (!deleteConfirmPreset) return;
    if (offline.status === "offline") {
      setToastMessage({
        text: "Connect to the network to delete repair presets.",
        isError: true,
      });
      setDeleteConfirmPreset(null);
      return;
    }

    setIsDeleting(true);
    try {
      await remove(`/repairs/presets/${deleteConfirmPreset.id}`);
      setToastMessage({ text: `${label} preset deleted.` });
      setDeleteConfirmPreset(null);
      await presets.reload();
    } catch (reason) {
      setToastMessage({
        text: reason instanceof Error ? reason.message : `${label} preset could not be deleted.`,
        isError: true,
      });
    } finally {
      setIsDeleting(false);
    }
  }

  // Copy to clipboard
  async function handleCopy(preset: RepairPreset) {
    try {
      await navigator.clipboard.writeText(preset.value);
      setCopiedId(preset.id);
      setToastMessage({ text: "Preset copied to clipboard." });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setToastMessage({
        text: "Unable to copy preset to clipboard.",
        isError: true,
      });
    }
  }

  const starterTemplates = STARTER_PRESET_TEMPLATES[type];

  return (
    <div className="preset-page-wrap">
      {mini && (
        <div style={{ marginBottom: "1rem" }}>
          <Link
            href="/repairs"
            className="text-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
              <Icon name="arrow" size={14} />
            </span>
            <span>Back to Repairs</span>
          </Link>
        </div>
      )}
      {/* Page Header with Action */}
      <PageHeader
        eyebrow="Repair Catalog & Configuration"
        title={`${label} presets`}
        description={`Manage shop-standard ${label.toLowerCase()} descriptions to streamline device intake and diagnostics.`}
        action={
          <Button
            type="button"
            icon="plus"
            onClick={() => openCreateModal()}
            disabled={offline.status === "offline" || !currentShop}
          >
            New {label.toLowerCase()} preset
          </Button>
        }
      />

      {/* Sibling Tab Switcher: Issue Presets <-> Condition Presets */}
      <nav className="preset-type-tabs" aria-label="Preset category switcher">
        <Link
          href="/repairs/issue-presets"
          className={`preset-tab-link ${type === "ISSUE" ? "active" : ""}`}
        >
          <Icon name="repair" size={15} />
          <span>Issue presets</span>
          {type === "ISSUE" && <span className="preset-tab-badge">{presets.data.length}</span>}
        </Link>
        <Link
          href="/repairs/condition-presets"
          className={`preset-tab-link ${type === "CONDITION" ? "active" : ""}`}
        >
          <Icon name="tag" size={15} />
          <span>Condition presets</span>
          {type === "CONDITION" && <span className="preset-tab-badge">{presets.data.length}</span>}
        </Link>
      </nav>

      {/* Toast Alert Notice */}
      {toastMessage && (
        <div
          className={`preset-toast-notice ${toastMessage.isError ? "error" : "success"}`}
          role="status"
        >
          <span>{toastMessage.text}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss message"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <section className="preset-stats-grid">
        <StatCard
          icon={type === "ISSUE" ? "repair" : "tag"}
          label={`Active ${label} Presets`}
          value={String(presets.data.length)}
          note="Ready for one-tap intake autofill"
          tone={type === "ISSUE" ? "amber" : "mint"}
        />
        <StatCard
          icon="store"
          label="Preset Scope"
          value={currentShop?.name ?? "All Shops"}
          note={
            currentShop
              ? "Available to intake staff at this shop"
              : "Select a shop to manage presets"
          }
          tone="blue"
        />
        <StatCard
          icon="check"
          label="Filtered View"
          value={String(filteredPresets.length)}
          note={searchQuery ? `Matches for "${searchQuery}"` : "Total configured in current filter"}
          tone="purple"
        />
      </section>

      {/* Quick Starter Templates Recommendation Strip */}
      <section className="preset-templates-card">
        <div className="preset-templates-header">
          <div>
            <h3>
              <Icon name="palette" size={15} />
              <span>Recommended Starter Templates</span>
            </h3>
            <p>Tap any template below to quickly create a standard {label.toLowerCase()} preset:</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowTemplates((prev) => !prev)}
            aria-expanded={showTemplates}
          >
            {showTemplates ? "Hide" : "Show"}
          </Button>
        </div>

        {showTemplates && (
          <div className="preset-template-chips">
            {starterTemplates.map((template) => {
              const alreadyExists = presets.data.some(
                (p) => (p.value ?? "").toLowerCase() === template.value.toLowerCase(),
              );
              return (
                <button
                  key={template.label}
                  type="button"
                  className="preset-chip-btn"
                  onClick={() => openCreateModal(template.value)}
                  disabled={offline.status === "offline"}
                  title={template.value}
                >
                  <span className="chip-icon">{alreadyExists ? "✓" : "+"}</span>
                  <span>{template.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Filter and Sorting Toolbar */}
      <ListControls
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={`Search ${label.toLowerCase()} presets...`}
        filter="ALL"
        onFilterChange={() => {}}
        filterLabel="Filter presets"
        filterOptions={[{ value: "ALL", label: `All ${label.toLowerCase()} presets` }]}
        sort={sortOption}
        onSortChange={(value) => setSortOption(value as PresetSortOption)}
        sortLabel="Sort presets"
        sortOptions={PRESET_SORT_OPTIONS}
      />

      {/* Main Presets Cards View */}
      <section aria-label={`${label} presets list`}>
        {presets.loading ? (
          <Loading />
        ) : presets.data.length === 0 ? (
          <EmptyState
            icon={type === "ISSUE" ? "repair" : "tag"}
            title={`No ${label.toLowerCase()} presets found`}
            message={`Get started by adding the first ${label.toLowerCase()} preset for ${currentShop?.name ?? "your shop"}. You can also pick from the recommended templates above.`}
            action={
              <Button
                type="button"
                icon="plus"
                onClick={() => openCreateModal()}
                disabled={offline.status === "offline" || !currentShop}
              >
                Create first {label.toLowerCase()} preset
              </Button>
            }
          />
        ) : filteredPresets.length === 0 ? (
          <EmptyState
            icon="search"
            title="No matching presets"
            message={`No ${label.toLowerCase()} presets match "${searchQuery}". Try a different keyword.`}
            action={
              <Button type="button" variant="secondary" onClick={() => setSearchQuery("")}>
                Clear search filter
              </Button>
            }
          />
        ) : (
          <div className="preset-grid">
            {pagination.pageItems.map((preset) => (
              <article key={preset.id} className="preset-card">
                <div>
                  <div className="preset-card-top">
                    <div className="preset-badge-group">
                      <span className={`preset-type-pill ${type.toLowerCase()}`}>
                        <Icon name={type === "ISSUE" ? "repair" : "tag"} size={12} />
                        <span>{label}</span>
                      </span>
                      {currentShop?.name && (
                        <span className="preset-shop-badge" title={currentShop.name}>
                          {currentShop.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="preset-card-content">{preset.value}</div>
                </div>

                <div className="preset-card-bottom">
                  <div className="preset-meta-info">
                    <span>{preset.value.length} chars</span>
                    {preset.created_at && (
                      <span>• {new Date(preset.created_at).toLocaleDateString()}</span>
                    )}
                  </div>

                  <div className="preset-card-actions">
                    <button
                      type="button"
                      className={`preset-action-btn ${copiedId === preset.id ? "copied" : ""}`}
                      onClick={() => void handleCopy(preset)}
                      title="Copy preset description to clipboard"
                    >
                      <Icon name={copiedId === preset.id ? "check" : "history"} size={13} />
                      <span>{copiedId === preset.id ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      type="button"
                      className="preset-action-btn"
                      onClick={() => openEditModal(preset)}
                      title="Edit preset description"
                      disabled={offline.status === "offline"}
                    >
                      <Icon name="edit" size={13} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      className="preset-action-btn danger"
                      onClick={() => setDeleteConfirmPreset(preset)}
                      title="Delete preset"
                      disabled={offline.status === "offline"}
                    >
                      <Icon name="trash" size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        <Pagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
          itemLabel={`${label.toLowerCase()} presets`}
          onPageChange={pagination.setPageIndex}
        />
      </section>

      {/* Floating Action Button for Mobile Screens */}
      {!isModalOpen && deleteConfirmPreset === null && (
        <button
          type="button"
          className="preset-mobile-fab"
          onClick={() => openCreateModal()}
          disabled={offline.status === "offline" || !currentShop}
          aria-label={`Add new ${label.toLowerCase()} preset`}
        >
          <Icon name="plus" size={16} />
          <span>New preset</span>
        </button>
      )}

      {/* Create / Edit Preset Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingPreset ? `Edit ${label} preset` : `New ${label} preset`}
        description={`Define a standardized ${label.toLowerCase()} description that intake technicians can autofill with one tap.`}
      >
        <Form onSubmit={handleSave}>
          <Field label={`${label} description`} hint="Be concise and clear. Max 500 characters.">
            <textarea
              name="value"
              value={presetValueInput}
              onChange={(event) => {
                setPresetValueInput(event.target.value);
                if (formError) setFormError("");
              }}
              placeholder={`e.g. ${starterTemplates[0]?.value ?? "Description..."}`}
              rows={4}
              maxLength={500}
              required
              autoFocus
            />
          </Field>

          <div
            className={`preset-char-counter ${
              presetValueInput.length > 450
                ? "danger"
                : presetValueInput.length > 350
                  ? "warning"
                  : ""
            }`}
          >
            {presetValueInput.length} / 500 characters
          </div>

          {formError && <div className="form-error">{formError}</div>}

          {/* Preset Suggestions inside Modal */}
          <div className="preset-modal-templates">
            <h4>Quick insert template:</h4>
            <div className="preset-template-chips">
              {starterTemplates.slice(0, 8).map((template) => (
                <button
                  key={template.label}
                  type="button"
                  className="preset-chip-btn"
                  onClick={() => {
                    setPresetValueInput(template.value);
                    if (formError) setFormError("");
                  }}
                >
                  <span className="chip-icon">+</span>
                  <span>{template.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={offline.status === "offline" || isSubmitting || !presetValueInput.trim()}
            >
              {isSubmitting ? "Saving..." : editingPreset ? "Update preset" : "Save preset"}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Safe Delete Confirmation Modal */}
      <Modal
        open={deleteConfirmPreset !== null}
        onClose={() => setDeleteConfirmPreset(null)}
        title={`Delete ${label.toLowerCase()} preset?`}
        description="This action removes the preset from the intake autofill menu."
      >
        <div className="preset-delete-warning">
          <p>Are you sure you want to permanently delete this {label.toLowerCase()} preset?</p>
          <div className="preset-delete-quote">&ldquo;{deleteConfirmPreset?.value}&rdquo;</div>
          <small>
            Historical repair tickets and invoices that used this preset text will remain intact.
          </small>
        </div>

        <div className="modal-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDeleteConfirmPreset(null)}
            disabled={isDeleting}
          >
            Keep preset
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Yes, delete preset"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
