"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Icon, type IconName } from "./icons";
import { getPaginationPages, paginateItems } from "@/lib/list-pagination";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}

export type ListControlOption = { value: string; label: string };

export function ListControls({
  search,
  onSearchChange,
  searchPlaceholder,
  filter,
  onFilterChange,
  filterOptions,
  filterLabel = "Filter list",
  sort,
  onSortChange,
  sortOptions,
  sortLabel = "Sort list",
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filter: string;
  onFilterChange: (value: string) => void;
  filterOptions: ListControlOption[];
  filterLabel?: string;
  sort: string;
  onSortChange: (value: string) => void;
  sortOptions: ListControlOption[];
  sortLabel?: string;
}) {
  return (
    <div className="toolbar list-toolbar">
      <div className="search-box">
        <Icon name="search" size={17} />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
      </div>
      <select
        className="filter-select"
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
        aria-label={filterLabel}
      >
        {filterOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        className="filter-select"
        value={sort}
        onChange={(event) => onSortChange(event.target.value)}
        aria-label={sortLabel}
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const FormSubmittingContext = createContext(false);

export function Form({
  children,
  onSubmit,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const lock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true);
    try {
      await onSubmit(event);
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return (
    <FormSubmittingContext.Provider value={submitting}>
      <form {...props} onSubmit={submit} aria-busy={submitting}>
        {children}
      </form>
    </FormSubmittingContext.Provider>
  );
}

export function Button({
  children,
  icon,
  variant = "primary",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const formSubmitting = useContext(FormSubmittingContext);
  return (
    <button className={`button button-${variant}`} {...props} disabled={disabled || formSubmitting}>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}

export function StatCard({
  label,
  value,
  note,
  icon,
  tone = "mint",
}: {
  label: string;
  value: string;
  note: string;
  icon: IconName;
  tone?: "mint" | "blue" | "amber" | "purple";
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon name={icon} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

export function EmptyState({
  icon = "box",
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "conflict";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      <i />
      {children}
    </span>
  );
}

const statusToneMap: Record<string, StatusTone> = {
  ACTIVE: "success",
  AMOUNT_PAID: "warning",
  APPLIED: "success",
  APPROVED: "success",
  AVAILABLE: "success",
  BLOCKED: "danger",
  CAPTURED: "success",
  CANCELLED: "danger",
  CHECKING: "warning",
  COMPLETED: "success",
  CONNECTED: "success",
  CONNECTED_AND_READY: "success",
  CONFLICT: "conflict",
  DEPOSIT_PAID: "warning",
  DISCONNECTED: "danger",
  ERROR: "danger",
  FAILED: "danger",
  INACTIVE: "danger",
  IN_PROGRESS: "info",
  IGNORED: "neutral",
  OFFLINE: "danger",
  OPEN: "info",
  PAID: "success",
  PARTIALLY_REFUNDED: "warning",
  PENDING: "warning",
  PENDING_AUTHORIZATION: "warning",
  PENDING_PAYMENT_AUTHORIZATION: "warning",
  PENDING_SYNCHRONIZATION: "warning",
  PROVISIONAL_CASH: "warning",
  READY_FOR_PICKUP: "info",
  RECEIVED: "neutral",
  REFUNDED: "danger",
  REJECTED: "danger",
  RECONNECTING: "warning",
  RESOLVED: "success",
  SCANNING: "info",
  SUCCEEDED: "success",
  SYNCED: "success",
  SYNCING: "info",
  UNAVAILABLE: "danger",
  UNPAID: "warning",
  TAP_TO_CONNECT: "info",
};

export function statusTone(status: string): StatusTone {
  return statusToneMap[status.trim().replaceAll(" ", "_").toUpperCase()] ?? "neutral";
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={statusTone(status)}>{label ?? status.replaceAll("_", " ")}</Badge>;
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  className = "",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const childList = Children.toArray(children);
  const candidate = childList.length === 1 && isValidElement(childList[0]) ? childList[0] : null;
  const isDirectControl =
    candidate !== null &&
    typeof candidate.type === "string" &&
    ["input", "select", "textarea"].includes(candidate.type);
  const control = isDirectControl ? (candidate as ReactElement<{ id?: string }>) : null;
  const controlId = control?.props.id ?? `${generatedId}-control`;
  const labelId = `${generatedId}-label`;

  return (
    <div className="field" {...(!control ? { role: "group", "aria-labelledby": labelId } : {})}>
      {control ? <label htmlFor={controlId}>{label}</label> : <span id={labelId}>{label}</span>}
      {control ? cloneElement(control, { id: controlId }) : children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading">
      <i />
      <i />
      <i />
      <span>Loading workspace…</span>
    </div>
  );
}

export function Pagination({
  pageIndex,
  pageSize,
  totalItems,
  totalPages = Math.max(1, Math.ceil(totalItems / pageSize)),
  itemLabel = "items",
  onPageChange,
}: {
  pageIndex: number;
  pageSize: number;
  totalItems: number;
  totalPages?: number;
  itemLabel?: string;
  onPageChange: (pageIndex: number) => void;
}) {
  const pages = getPaginationPages(pageIndex, totalPages);
  const firstItem = totalItems === 0 ? 0 : pageIndex * pageSize + 1;
  const lastItem = Math.min(totalItems, (pageIndex + 1) * pageSize);

  if (totalItems === 0) return null;

  return (
    <nav className="list-pagination" aria-label={`${itemLabel} pagination`}>
      <p>
        Showing{" "}
        <strong>
          {firstItem}–{lastItem}
        </strong>{" "}
        of <strong>{totalItems}</strong> {itemLabel}
      </p>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-step"
          disabled={pageIndex === 0}
          onClick={() => onPageChange(pageIndex - 1)}
          aria-label="Go to previous page"
        >
          Previous
        </button>
        <div className="pagination-pages">
          {pages.map((page, index) => (
            <span key={page} className="pagination-page-slot">
              {index > 0 && page - pages[index - 1] > 1 && (
                <span className="pagination-ellipsis" aria-hidden="true">
                  …
                </span>
              )}
              <button
                type="button"
                className={page === pageIndex ? "is-current" : ""}
                onClick={() => onPageChange(page)}
                aria-label={`Go to page ${page + 1}`}
                aria-current={page === pageIndex ? "page" : undefined}
              >
                {page + 1}
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          className="pagination-step"
          disabled={pageIndex + 1 >= totalPages}
          onClick={() => onPageChange(pageIndex + 1)}
          aria-label="Go to next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export function useListPagination<T>(items: T[], pageSize = 10, resetKey?: string) {
  const [pageState, setPageState] = useState({ resetKey, pageIndex: 0 });
  const pageIndex = pageState.resetKey === resetKey ? pageState.pageIndex : 0;
  const { currentPage, totalPages } = paginateItems(items, pageIndex, pageSize);

  const pageItems = useMemo(
    () => paginateItems(items, currentPage, pageSize).pageItems,
    [currentPage, items, pageSize],
  );

  return {
    pageIndex: currentPage,
    pageItems,
    pageSize,
    setPageIndex: (nextPageIndex: number) => setPageState({ resetKey, pageIndex: nextPageIndex }),
    totalItems: items.length,
    totalPages,
  };
}
