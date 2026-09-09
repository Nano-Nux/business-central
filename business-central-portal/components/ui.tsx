"use client";

import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
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
    <header className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 mb-6">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="eyebrow text-[10px] font-bold uppercase tracking-[0.08em] text-muted mb-1 m-0">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl sm:text-3xl font-serif font-medium tracking-tight text-ink m-0 leading-snug">
          {title}
        </h1>
        <p className="page-description text-xs sm:text-sm text-muted max-w-[680px] m-0 leading-relaxed mt-1">
          {description}
        </p>
      </div>
      {action && (
        <div className="page-actions flex flex-wrap items-center gap-2.5 shrink-0">{action}</div>
      )}
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
    <div className="toolbar list-toolbar flex flex-wrap items-center gap-3 mb-5">
      <div className="search-box relative flex-1 min-w-[200px] flex items-center">
        <span className="absolute left-3 text-muted pointer-events-none flex items-center">
          <Icon name="search" size={17} />
        </span>
        <input
          type="search"
          className="w-full h-10 pl-9 pr-3 text-sm bg-paper text-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-ink/20 transition"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
      </div>
      <select
        className="filter-select h-10 px-3 py-2 text-sm bg-paper text-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-ink/20 transition cursor-pointer"
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
        className="filter-select h-10 px-3 py-2 text-sm bg-paper text-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-ink/20 transition cursor-pointer"
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
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const formSubmitting = useContext(FormSubmittingContext);
  const variantStyles = {
    primary: "bg-ink text-paper hover:opacity-90",
    secondary: "bg-paper text-ink border border-line hover:bg-canvas",
    ghost: "bg-transparent text-muted hover:text-ink hover:bg-canvas",
    danger: "bg-status-danger text-white hover:opacity-90",
  }[variant];

  return (
    <button
      className={`button button-${variant} inline-flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${variantStyles} ${className}`.trim()}
      {...props}
      disabled={disabled || formSubmitting}
    >
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
  const toneStyles = {
    mint: "bg-status-success-soft text-status-success",
    blue: "bg-status-info-soft text-status-info",
    amber: "bg-status-warning-soft text-status-warning",
    purple: "bg-status-conflict-soft text-status-conflict",
  }[tone];

  return (
    <article className="stat-card flex items-center gap-3.5 p-4 rounded-xl border border-line bg-paper shadow-xs">
      <div
        className={`stat-icon ${tone} flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${toneStyles}`}
      >
        <Icon name={icon} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider m-0">{label}</p>
        <strong className="block text-xl font-bold text-ink mt-0.5">{value}</strong>
        <small className="block text-xs text-muted mt-0.5 truncate">{note}</small>
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
    <div className="empty-state flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-line bg-paper/50">
      <span className="flex items-center justify-center w-12 h-12 rounded-full bg-canvas text-muted mb-3">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="text-base font-semibold text-ink m-0 mb-1">{title}</h3>
      <p className="text-sm text-muted m-0 mb-4 max-w-sm">{message}</p>
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
  const toneStyles: Record<StatusTone, string> = {
    success: "bg-status-success-soft text-status-success border-status-success-border",
    warning: "bg-status-warning-soft text-status-warning border-status-warning-border",
    danger: "bg-status-danger-soft text-status-danger border-status-danger-border",
    info: "bg-status-info-soft text-status-info border-status-info-border",
    neutral: "bg-status-neutral-soft text-status-neutral border-status-neutral-border",
    conflict: "bg-status-conflict-soft text-status-conflict border-status-conflict-border",
  };

  return (
    <span
      className={`badge badge-${tone} inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${toneStyles[tone]}`}
    >
      <i className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
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
  const maxWidthClass = className.includes("max-w-") ? "" : "max-w-lg";
  const paddingClass = className.includes("p-") ? "" : "p-4 sm:p-6";

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`modal bg-paper rounded-2xl border border-line shadow-2xl w-full ${maxWidthClass} max-h-[92vh] overflow-y-auto ${paddingClass} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head flex items-start justify-between gap-4 mb-5 pb-4 border-b border-line">
          <div>
            <h2 className="text-lg font-bold text-ink m-0">{title}</h2>
            {description && <p className="text-xs text-muted m-0 mt-1">{description}</p>}
          </div>
          <button
            className="icon-button p-1.5 rounded-lg text-muted hover:text-ink hover:bg-canvas cursor-pointer transition"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export interface PasswordInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  inputClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { className = "", inputClassName = "", id, value, ...props },
    forwardedRef,
  ) {
    const [show, setShow] = useState(false);
    const internalInputRef = useRef<HTMLInputElement>(null);
    const suppressClickUntilRef = useRef(0);

    const setRefs = (node: HTMLInputElement | null) => {
      internalInputRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    };

    function toggle() {
      const input = internalInputRef.current;
      const isFocused = typeof document !== "undefined" && document.activeElement === input;
      const start = input?.selectionStart ?? (typeof value === "string" ? value.length : undefined);
      const end = input?.selectionEnd ?? start;
      setShow((prev) => !prev);
      if (isFocused) {
        window.requestAnimationFrame(() => {
          const nextInput = internalInputRef.current;
          nextInput?.focus({ preventScroll: true });
          if (typeof start === "number" && typeof end === "number") {
            nextInput?.setSelectionRange(start, end);
          }
        });
      }
    }

    return (
      <div className={`password-field relative flex items-center w-full ${className}`.trim()}>
        <input
          {...props}
          id={id}
          ref={setRefs}
          value={value}
          type={show ? "text" : "password"}
          className={`w-full h-11 pl-3.5 pr-12 text-sm bg-canvas border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 focus:bg-paper transition ${inputClassName}`.trim()}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          title={show ? "Hide password" : "Show password"}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onTouchEnd={(event) => {
            event.preventDefault();
            event.stopPropagation();
            suppressClickUntilRef.current = Date.now() + 750;
            toggle();
          }}
          onClick={(event) => {
            if (Date.now() < suppressClickUntilRef.current) {
              event.preventDefault();
              return;
            }
            toggle();
          }}
        >
          <Icon name={show ? "eye-off" : "eye"} size={20} />
        </button>
      </div>
    );
  },
);

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const childList = Children.toArray(children);
  const candidate = childList.length === 1 && isValidElement(childList[0]) ? childList[0] : null;
  const isDirectControl =
    candidate !== null &&
    ((typeof candidate.type === "string" &&
      ["input", "select", "textarea"].includes(candidate.type)) ||
      candidate.type === PasswordInput);
  const control = isDirectControl
    ? (candidate as ReactElement<{ id?: string; className?: string }>)
    : null;
  const controlId = control?.props.id ?? `${generatedId}-control`;
  const labelId = `${generatedId}-label`;
  const spacingClass =
    className.includes("mb-") || className.includes("my-") || className.includes("m-")
      ? ""
      : "mb-4";

  return (
    <div
      className={`field flex flex-col gap-1.5 ${spacingClass} ${className}`.trim()}
      {...(!control ? { role: "group", "aria-labelledby": labelId } : {})}
    >
      {control ? (
        <label
          className="text-xs font-semibold text-muted uppercase tracking-wider"
          htmlFor={controlId}
        >
          {label}
        </label>
      ) : (
        <span className="text-xs font-semibold text-muted uppercase tracking-wider" id={labelId}>
          {label}
        </span>
      )}
      {control ? cloneElement(control, { id: controlId }) : children}
      {hint && <small className="text-xs text-muted">{hint}</small>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading flex items-center gap-2 text-sm text-muted">
      <i className="w-2 h-2 rounded-full bg-green animate-pulse" />
      <i className="w-2 h-2 rounded-full bg-green animate-pulse [animation-delay:0.2s]" />
      <i className="w-2 h-2 rounded-full bg-green animate-pulse [animation-delay:0.4s]" />
      <span className="ml-1">Loading workspace…</span>
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
    <nav
      className="list-pagination flex flex-wrap items-center justify-between gap-4 pt-4 mt-4 border-t border-line text-xs text-muted"
      aria-label={`${itemLabel} pagination`}
    >
      <p className="m-0">
        Showing{" "}
        <strong className="text-ink">
          {firstItem}–{lastItem}
        </strong>{" "}
        of <strong className="text-ink">{totalItems}</strong> {itemLabel}
      </p>
      <div className="pagination-controls flex items-center gap-2">
        <button
          type="button"
          className="pagination-step px-3 py-1.5 rounded-lg border border-line bg-paper text-ink font-medium hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          disabled={pageIndex === 0}
          onClick={() => onPageChange(pageIndex - 1)}
          aria-label="Go to previous page"
        >
          Previous
        </button>
        <div className="pagination-pages flex items-center gap-1">
          {pages.map((page, index) => (
            <span key={page} className="pagination-page-slot flex items-center">
              {index > 0 && page - pages[index - 1] > 1 && (
                <span className="pagination-ellipsis px-1 text-muted" aria-hidden="true">
                  …
                </span>
              )}
              <button
                type="button"
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center ${
                  page === pageIndex
                    ? "is-current bg-ink text-paper"
                    : "border border-line bg-paper text-ink hover:bg-canvas"
                }`}
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
          className="pagination-step px-3 py-1.5 rounded-lg border border-line bg-paper text-ink font-medium hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
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
