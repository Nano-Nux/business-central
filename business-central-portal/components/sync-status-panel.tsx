"use client";

import { useState } from "react";
import Link from "next/link";
import { useOffline } from "@/lib/offline";

function operationLabel(entityType: string) {
  if (entityType === "SHOP_SETTINGS") return "Shop settings";
  if (entityType === "POS_CHECKOUT") return "Offline checkout";
  if (entityType === "PROMOTION") return "Promotion";
  if (entityType === "PROMOTION_SCOPE") return "Promotion scope";
  if (entityType === "PROMOTION_CODE") return "Promotion code";
  if (entityType === "REPAIR_SERVICE") return "Repair catalog";
  if (entityType === "REPAIR_ORDER") return "Repair ticket";
  if (entityType === "REPAIR_PART") return "Repair stock part";
  if (entityType === "REPAIR_PAYMENT") return "Repair payment";
  if (entityType === "REPAIR_IMAGE") return "Repair image";
  if (entityType === "SHOP") return "Shop settings";
  if (entityType === "CATALOG_PRODUCT") return "Product";
  if (entityType === "CATALOG_VARIANT") return "Product variant";
  return entityType;
}

export function SyncStatusPanel() {
  const offline = useOffline();
  const [resolving, setResolving] = useState<string | null>(null);
  const visible = offline.operations.filter((operation) => operation.status !== "SYNCED");
  const unsuccessful = visible.filter((operation) =>
    ["FAILED", "REJECTED", "CONFLICT", "BLOCKED"].includes(operation.status),
  );

  const hasFailingAttempts =
    offline.consecutiveSyncErrors >= 5 ||
    unsuccessful.some((op) => (op.retryCount ?? 0) >= 5 || op.status === "FAILED");

  const hasIssues =
    offline.conflicts > 0 ||
    offline.rejected > 0 ||
    offline.failed > 0 ||
    Boolean(offline.lastError) ||
    hasFailingAttempts;

  const summaryTone = hasIssues
    ? "danger"
    : offline.storage.warning || offline.pending > 0
      ? "warning"
      : offline.staleResources.length > 0
        ? "info"
        : "success";

  const summaryLabel =
    offline.conflicts > 0 || offline.rejected > 0 || offline.failed > 0 || hasFailingAttempts
      ? "Review sync"
      : offline.pending > 0
        ? `${offline.pending} pending`
        : offline.lastError
          ? "Sync issue"
          : "Synced";

  const summaryClass =
    summaryTone === "danger"
      ? "bg-status-danger-soft text-status-danger border-status-danger-border"
      : summaryTone === "warning"
        ? "bg-status-warning-soft text-status-warning border-status-warning-border"
        : summaryTone === "info"
          ? "bg-status-info-soft text-status-info border-status-info-border"
          : "bg-status-success-soft text-status-success border-status-success-border";

  return (
    <details className="sync-status-panel relative inline-block">
      <summary
        className={`sync-summary-${summaryTone} inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer select-none transition ${summaryClass}`}
      >
        {summaryLabel}
      </summary>
      <div className="sync-status-menu absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-paper border border-line shadow-2xl p-4 z-50 max-h-[80vh] overflow-y-auto space-y-3 text-ink">
        <div className="sync-status-head pb-3 border-b border-line">
          <div className="sync-status-head-title flex items-center justify-between font-bold text-sm text-ink mb-0.5">
            <strong>Synchronization</strong>
            <span
              className={`live-dot w-2 h-2 rounded-full ${
                offline.status === "offline"
                  ? "bg-status-danger"
                  : offline.status === "syncing"
                    ? "bg-status-info animate-pulse"
                    : offline.status === "reconnecting"
                      ? "bg-status-warning animate-pulse"
                      : offline.status === "error"
                        ? "bg-status-danger"
                        : "bg-status-success"
              }`}
            />
          </div>
          <small className="text-xs text-muted block">
            {offline.status === "offline"
              ? "Waiting for a connection"
              : offline.status === "syncing"
                ? "Synchronizing changes with server…"
                : offline.status === "reconnecting"
                  ? "Reconnecting to server…"
                  : hasIssues
                    ? "Synchronization needs attention"
                    : visible.length === 0
                      ? "All changes synchronized"
                      : "Backend-authoritative temporary offline mode"}
          </small>
        </div>
        {offline.lastError && (
          <div className="sync-status-error-block p-3 rounded-xl bg-status-danger-soft text-status-danger border border-status-danger-border space-y-2">
            <p className="sync-status-error text-xs font-semibold">{offline.lastError}</p>
            {hasFailingAttempts && (
              <p className="sync-status-error-hint text-[11px] opacity-90">
                Synchronization received errors{" "}
                {offline.consecutiveSyncErrors >= 5
                  ? `${offline.consecutiveSyncErrors} times`
                  : "5 times"}
                . You can remove that failing data below.
              </p>
            )}
            <div className="sync-operation-actions flex items-center gap-2 pt-1">
              <button
                type="button"
                className="button button-secondary px-2.5 py-1 rounded-md border border-status-danger-border bg-paper text-status-danger text-xs font-semibold hover:bg-canvas transition"
                disabled={
                  Boolean(resolving) || offline.status === "offline" || offline.status === "syncing"
                }
                onClick={() => {
                  setResolving("sync-error");
                  void offline.syncNow().finally(() => setResolving(null));
                }}
              >
                Retry sync
              </button>
              {hasFailingAttempts && (
                <button
                  type="button"
                  className="button button-danger px-2.5 py-1 rounded-md bg-status-danger text-white text-xs font-semibold hover:opacity-90 transition"
                  disabled={Boolean(resolving)}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Remove the failing offline data? This action cannot be undone.",
                      )
                    ) {
                      return;
                    }
                    setResolving("remove-failing");
                    void offline.discardFailingOperations().finally(() => setResolving(null));
                  }}
                >
                  {resolving === "remove-failing" ? "Removing…" : "Remove data"}
                </button>
              )}
              <button
                type="button"
                className="button button-secondary px-2.5 py-1 rounded-md border border-status-danger-border bg-paper text-status-danger text-xs font-semibold hover:bg-canvas transition"
                disabled={Boolean(resolving)}
                onClick={() => offline.clearLastError()}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {offline.storage.warning && (
          <p className="sync-storage-warning text-xs text-status-warning p-2.5 rounded-lg bg-status-warning-soft border border-status-warning-border">
            {offline.storage.warning}
          </p>
        )}
        {offline.storage.quota !== null && (
          <small className="sync-storage-usage block text-[11px] text-muted">
            Offline storage: {formatBytes(offline.storage.usage ?? 0)} of{" "}
            {formatBytes(offline.storage.quota)} used
            {offline.storage.persisted ? " (protected)" : ""}
          </small>
        )}
        {offline.staleResources.length > 0 && (
          <p className="sync-stale-resources text-xs text-status-info p-2.5 rounded-lg bg-status-info-soft border border-status-info-border">
            {offline.staleResources.length} view
            {offline.staleResources.length === 1 ? " is" : "s are"} showing saved data. They refresh
            automatically after reconnection.
          </p>
        )}
        {unsuccessful.length > 1 && (
          <div className="sync-bulk-actions flex items-center gap-2 pt-2 border-t border-line">
            <button
              type="button"
              className="button button-secondary flex-1 px-3 py-1.5 rounded-lg border border-line bg-paper text-ink text-xs font-semibold hover:bg-canvas transition"
              disabled={
                Boolean(resolving) || offline.status === "offline" || offline.status === "syncing"
              }
              onClick={() => {
                setResolving("bulk-retry");
                void offline.retryAllUnsuccessful().finally(() => setResolving(null));
              }}
            >
              {resolving === "bulk-retry" ? "Retrying all…" : `Retry all (${unsuccessful.length})`}
            </button>
            <button
              type="button"
              className="button button-danger flex-1 px-3 py-1.5 rounded-lg bg-status-danger text-white text-xs font-semibold hover:opacity-90 transition"
              disabled={Boolean(resolving)}
              onClick={() => {
                if (
                  !window.confirm(
                    `Remove all ${unsuccessful.length} unsuccessful offline records? This action cannot be undone.`,
                  )
                ) {
                  return;
                }
                setResolving("bulk-delete");
                void offline.discardAllUnsuccessful().finally(() => setResolving(null));
              }}
            >
              {resolving === "bulk-delete"
                ? "Removing all…"
                : `Remove all (${unsuccessful.length})`}
            </button>
          </div>
        )}
        {visible.length === 0 && !offline.lastError && (
          <div className="sync-status-empty py-4 text-center text-xs text-muted">
            <p className="m-0">All offline changes have been synchronized with the server.</p>
            {offline.lastSyncAt && (
              <small className="block mt-1 text-[11px] text-muted">
                Last synchronized:{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(offline.lastSyncAt))}
              </small>
            )}
          </div>
        )}
        <div className="sync-operation-list space-y-2.5">
          {visible.map((operation) => {
            const isProcessing = resolving === operation.operationId;
            const attemptCount = operation.retryCount ?? 0;
            const isFailing = attemptCount >= 5 || operation.status === "FAILED";
            return (
              <article
                key={operation.operationId}
                className="p-3 rounded-xl bg-canvas border border-line space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-bold text-ink truncate">
                    {operationLabel(operation.entityType)}
                  </strong>
                  <span
                    className={`sync-state sync-state-${operation.status.toLowerCase()} text-[10px] font-semibold px-2 py-0.5 rounded-full bg-paper border border-line text-muted`}
                  >
                    {operation.operationType} · {operation.status}
                    {attemptCount > 0 &&
                      ` (${attemptCount} attempt${attemptCount === 1 ? "" : "s"})`}
                  </span>
                </div>
                <small className="block text-[10px] text-muted">
                  Saved{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(operation.clientCreatedAt))}
                </small>
                {operation.lastError && (
                  <p className="sync-item-error text-status-danger text-[11px] m-0">
                    {operation.lastError}
                  </p>
                )}
                {isFailing && (
                  <p className="sync-retry-notice text-status-warning text-[11px] m-0">
                    Error received {attemptCount || 5} times. You can remove this data to unblock
                    synchronization.
                  </p>
                )}
                {operation.entityType === "REPAIR_ORDER" &&
                  operation.operationType === "CREATE" &&
                  (operation.status === "REJECTED" || operation.status === "FAILED") && (
                    <Link
                      className="button button-secondary inline-block px-2.5 py-1 rounded-md border border-line bg-paper text-ink text-xs font-semibold hover:bg-canvas transition"
                      href={`/repairs/sync-review/${encodeURIComponent(operation.operationId)}`}
                    >
                      Review and edit repair
                    </Link>
                  )}
                {operation.entityType === "POS_CHECKOUT" && operation.status === "REJECTED" && (
                  <div className="sync-checkout-review space-y-1.5 p-2 rounded-lg bg-paper border border-line">
                    {Boolean(operation.serverPayload?.payment_authorization_required) && (
                      <p className="text-[11px] text-muted m-0">
                        No external payment was captured. Complete provider authorization before
                        retrying this checkout.
                      </p>
                    )}
                    {Boolean(operation.serverPayload?.authoritative_quote) && (
                      <p className="text-[11px] text-muted m-0">
                        Authoritative total:{" "}
                        <strong className="text-ink">
                          {String(
                            (
                              (operation.serverPayload?.authoritative_quote ?? {}) as Record<
                                string,
                                unknown
                              >
                            ).grand_total ?? "Review required",
                          )}
                        </strong>
                        . The provisional record remains saved.
                      </p>
                    )}
                    <Link
                      className="button button-secondary inline-block px-2.5 py-1 rounded-md border border-line bg-paper text-ink text-xs font-semibold hover:bg-canvas transition"
                      href="/pos"
                    >
                      Review checkout
                    </Link>
                  </div>
                )}
                {operation.status === "CONFLICT" ? (
                  <>
                    {operation.serverOperationId ? (
                      <>
                        <p className="text-[11px] text-status-conflict m-0">
                          The server copy is being shown. Keep it or intentionally apply your saved
                          change over the latest server version.
                        </p>
                        <div className="sync-conflict-actions flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            className="button button-secondary flex-1 px-2 py-1 rounded-md border border-line bg-paper text-ink text-xs font-semibold hover:bg-canvas transition"
                            disabled={Boolean(resolving) || offline.status === "offline"}
                            onClick={() => {
                              setResolving(operation.operationId);
                              void offline
                                .resolveConflict(operation, "KEEP_SERVER")
                                .finally(() => setResolving(null));
                            }}
                          >
                            Keep server copy
                          </button>
                          <button
                            type="button"
                            className="button button-primary flex-1 px-2 py-1 rounded-md bg-ink text-paper text-xs font-semibold hover:opacity-90 transition"
                            disabled={Boolean(resolving) || offline.status === "offline"}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Apply your saved change over the latest server version?",
                                )
                              )
                                return;
                              setResolving(operation.operationId);
                              void offline
                                .resolveConflict(operation, "APPLY_CLIENT")
                                .finally(() => setResolving(null));
                            }}
                          >
                            Apply my change
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-muted m-0">
                        This change needs review before it can be replayed.
                      </p>
                    )}
                    <div className="sync-operation-actions flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        className="button button-secondary flex-1 px-2 py-1 rounded-md border border-line bg-paper text-ink text-xs font-semibold hover:bg-canvas transition"
                        disabled={Boolean(resolving) || offline.status === "syncing"}
                        onClick={() => {
                          setResolving(operation.operationId);
                          void offline.retryOperation(operation).finally(() => setResolving(null));
                        }}
                      >
                        {isProcessing ? "Retrying…" : "Retry"}
                      </button>
                      <button
                        type="button"
                        className="button button-danger flex-1 px-2 py-1 rounded-md bg-status-danger text-white text-xs font-semibold hover:opacity-90 transition"
                        disabled={Boolean(resolving)}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Remove this offline data? This action cannot be undone.",
                            )
                          ) {
                            return;
                          }
                          setResolving(operation.operationId);
                          void offline
                            .discardOperation(operation)
                            .finally(() => setResolving(null));
                        }}
                      >
                        {isProcessing ? "Removing…" : "Remove data"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="sync-operation-actions flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      className="button button-secondary flex-1 px-2 py-1 rounded-md border border-line bg-paper text-ink text-xs font-semibold hover:bg-canvas transition"
                      disabled={Boolean(resolving) || offline.status === "syncing"}
                      onClick={() => {
                        setResolving(operation.operationId);
                        void offline.retryOperation(operation).finally(() => setResolving(null));
                      }}
                    >
                      {isProcessing ? "Retrying…" : "Retry"}
                    </button>
                    <button
                      type="button"
                      className="button button-danger flex-1 px-2 py-1 rounded-md bg-status-danger text-white text-xs font-semibold hover:opacity-90 transition"
                      disabled={Boolean(resolving)}
                      onClick={() => {
                        if (
                          !window.confirm("Remove this offline data? This action cannot be undone.")
                        ) {
                          return;
                        }
                        setResolving(operation.operationId);
                        void offline.discardOperation(operation).finally(() => setResolving(null));
                      }}
                    >
                      {isProcessing ? "Removing…" : "Remove data"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {offline.status !== "offline" && (
          <button
            type="button"
            className="button button-primary w-full px-3 py-2 rounded-lg bg-ink text-paper text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
            onClick={() => void offline.syncNow()}
            disabled={offline.status === "syncing"}
          >
            {offline.status === "syncing" ? "Synchronizing…" : "Sync now"}
          </button>
        )}
      </div>
    </details>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
