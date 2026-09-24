"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { AdminLoading, AdminSignInRequired } from "../../../../components/admin-auth-state";
import { AdminShell } from "../../../../components/admin-shell";
import {
  getBackupDownloadUrl,
  listMerchantBackups,
  listMerchants,
  Merchant,
  MerchantBackup,
} from "../../../../lib/api";
import { useAdminSession } from "../../../../lib/use-admin-session";

export default function MerchantBackupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const merchantID = resolvedParams.id;
  const { session, ready, withAuth } = useAdminSession();

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [backups, setBackups] = useState<MerchantBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session || !merchantID) return;
    let cancelled = false;

    // Load merchant info and backup list in parallel
    Promise.all([
      withAuth((token) => listMerchants(token)),
      withAuth((token) => listMerchantBackups(token, merchantID)),
    ])
      .then(([merchantsRes, backupsRes]) => {
        if (cancelled) return;
        const found = merchantsRes.data.find((m) => m.id === merchantID) ?? null;
        setMerchant(found);
        setBackups(backupsRes.data || []);
        setError("");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, merchantID, withAuth]);

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;

  return (
    <AdminShell session={session} active="merchants">
      <header className="topbar">
        <div>
          <p className="eyebrow">DISASTER RECOVERY VAULT</p>
          <h1>{merchant ? `${merchant.name} · Backups` : "Merchant Backups"}</h1>
          <p className="muted">
            Uploaded encrypted SQLite database snapshots from offline-first mobile devices.
          </p>
        </div>
        <Link href="/merchants" className="outline-button" style={{ textDecoration: "none" }}>
          ← Back to Merchants
        </Link>
      </header>

      {error && <p className="error banner">{error}</p>}

      <section className="panel route-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RECOVERY SNAPSHOTS</p>
            <h2>{backups.length} Backups Available</h2>
          </div>
          <small className="muted">Retains up to 7 latest rolling backups automatically</small>
        </div>

        {loading ? (
          <p className="muted" style={{ padding: "2rem", textAlign: "center" }}>
            Loading backups…
          </p>
        ) : (
          <div className="data-list">
            {backups.map((backup) => (
              <div className="data-row" key={backup.id}>
                <span className="shop-icon" style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
                  📦
                </span>
                <span className="data-info">
                  <strong>{formatDate(backup.created_at)}</strong>
                  <small>
                    Device: <code>{backup.device_id}</code> · Size: {formatBytes(backup.file_size_bytes)} · SHA256:{" "}
                    <code>{backup.sha256_checksum.slice(0, 12)}…</code>
                  </small>
                </span>
                <a
                  className="row-action"
                  href={getBackupDownloadUrl(merchantID, backup.id)}
                  download={`backup_${backup.id}.zip`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  Download .zip ↓
                </a>
              </div>
            ))}

            {backups.length === 0 && (
              <div style={{ padding: "2.5rem", textAlign: "center" }}>
                <p className="muted">No backups uploaded yet for this merchant.</p>
                <small className="muted">
                  Backups appear here once the mobile device uploads a cloud snapshot.
                </small>
              </div>
            )}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
