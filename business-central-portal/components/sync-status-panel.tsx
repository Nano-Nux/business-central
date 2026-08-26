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
  if (
    visible.length === 0 &&
    !offline.lastError &&
    !offline.storage.warning &&
    offline.staleResources.length === 0
  ) {
    return null;
  }
  const summaryTone =
    offline.conflicts > 0 || offline.rejected > 0 || offline.lastError
      ? "danger"
      : offline.storage.warning || offline.pending > 0
        ? "warning"
        : offline.staleResources.length > 0
          ? "info"
          : "success";
  return (
    <details className="sync-status-panel">
      <summary className={`sync-summary-${summaryTone}`}>
        {offline.conflicts > 0 || offline.rejected > 0
          ? "Review sync"
          : offline.pending > 0
            ? `${offline.pending} pending`
            : "Saved data"}
      </summary>
      <div className="sync-status-menu">
        <div className="sync-status-head">
          <strong>Synchronization</strong>
          <small>
            {offline.status === "offline"
              ? "Waiting for a connection"
              : "Backend-authoritative temporary offline mode"}
          </small>
        </div>
        {offline.lastError && <p className="sync-status-error">{offline.lastError}</p>}
        {offline.storage.warning && (
          <p className="sync-storage-warning">{offline.storage.warning}</p>
        )}
        {offline.storage.quota !== null && (
          <small className="sync-storage-usage">
            Offline storage: {formatBytes(offline.storage.usage ?? 0)} of{" "}
            {formatBytes(offline.storage.quota)} used
            {offline.storage.persisted ? " (protected)" : ""}
          </small>
        )}
        {offline.staleResources.length > 0 && (
          <p className="sync-stale-resources">
            {offline.staleResources.length} view
            {offline.staleResources.length === 1 ? " is" : "s are"} showing saved data. They refresh
            automatically after reconnection.
          </p>
        )}
        <div className="sync-operation-list">
          {visible.map((operation) => (
            <article key={operation.operationId}>
              <div>
                <strong>{operationLabel(operation.entityType)}</strong>
                <span className={`sync-state sync-state-${operation.status.toLowerCase()}`}>
                  {operation.operationType} · {operation.status}
                </span>
              </div>
              <small>
                Saved{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(operation.clientCreatedAt))}
              </small>
              {operation.lastError && <p>{operation.lastError}</p>}
              {operation.entityType === "REPAIR_ORDER" &&
                operation.operationType === "CREATE" &&
                (operation.status === "REJECTED" || operation.status === "FAILED") && (
                  <Link
                    className="button button-secondary"
                    href={`/repairs/sync-review/${encodeURIComponent(operation.operationId)}`}
                  >
                    Review and edit repair
                  </Link>
                )}
              {operation.entityType === "POS_CHECKOUT" && operation.status === "REJECTED" && (
                <div className="sync-checkout-review">
                  {Boolean(operation.serverPayload?.payment_authorization_required) && (
                    <p>
                      No external payment was captured. Complete provider authorization before
                      retrying this checkout.
                    </p>
                  )}
                  {Boolean(operation.serverPayload?.authoritative_quote) && (
                    <p>
                      Authoritative total:{" "}
                      <strong>
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
                  <Link className="button button-secondary" href="/pos">
                    Review checkout
                  </Link>
                </div>
              )}
              {operation.status === "CONFLICT" && (
                <>
                  {operation.serverOperationId ? (
                    <>
                      <p>
                        The server copy is being shown. Keep it or intentionally apply your saved
                        change over the latest server version.
                      </p>
                      <div className="sync-conflict-actions">
                        <button
                          className="button button-secondary"
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
                          className="button button-primary"
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
                    <div className="sync-conflict-actions">
                      <p>This change needs review before it can be replayed.</p>
                      <button
                        className="button button-secondary"
                        disabled={Boolean(resolving) || offline.status === "offline"}
                        onClick={() => {
                          setResolving(operation.operationId);
                          void offline.retryOperation(operation).finally(() => setResolving(null));
                        }}
                      >
                        Retry after review
                      </button>
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
        {offline.status !== "offline" && offline.pending > 0 && (
          <button
            className="button button-primary"
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
