"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Form,
  Loading,
  ListControls,
  Modal,
  PageHeader,
  Pagination,
  StatusBadge,
  useListPagination,
} from "./ui";
import { useTranslation } from "@/lib/i18n";
import { patch, post, remove } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useAuth } from "@/lib/auth";
import { useShop } from "@/lib/shop";
import { useOffline } from "@/lib/offline";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { formatShopDateTime } from "@/lib/date-time";
import type { Location, Movement, Role, Shop, User, Variant, StockAsset } from "@/lib/types";
import { BarcodeScanner } from "./barcode-scanner";

export function StockAssetsPage() {
  const { t } = useTranslation();
  const assets = useResource<StockAsset>("/inventory/assets?page_index=0&page_size=500");
  const [query, setQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [assetSort, setAssetSort] = useState("PRODUCT_ASC");
  const [barcode, setBarcode] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = assets.data.find((asset) => asset.id === selectedId);
  const visible = useMemo(
    () =>
      assets.data
        .filter((asset) =>
          `${asset.product_name} ${asset.variant_name} ${asset.sku} ${asset.asset_tag} ${asset.barcode ?? ""} ${asset.status}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .filter(
          (asset) =>
            assetFilter === "ALL" ||
            (assetFilter === "WITH_BARCODE" ? !!asset.barcode : !asset.barcode),
        )
        .sort((a, b) =>
          assetSort === "PRODUCT_DESC"
            ? b.product_name.localeCompare(a.product_name)
            : assetSort === "ASSET_TAG"
              ? a.asset_tag.localeCompare(b.asset_tag)
              : assetSort === "STATUS"
                ? a.status.localeCompare(b.status)
                : a.product_name.localeCompare(b.product_name),
        ),
    [assetFilter, assetSort, assets.data, query],
  );
  const assetPagination = useListPagination(visible, 10, `${query}|${assetFilter}|${assetSort}`);

  async function assign(value = barcode) {
    if (!selected || !value.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await post("/catalog/barcodes", {
        code: value.trim(),
        target_type: "ASSET",
        target_id: selected.id,
        is_primary: true,
      });
      setBarcode("");
      setMessage(t("inventory.barcode_assigned"));
      await assets.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to assign barcode.");
    } finally {
      setBusy(false);
    }
  }

  async function clearBarcode() {
    if (!selected?.barcode_id) return;
    setBusy(true);
    setError("");
    try {
      await remove(`/catalog/barcodes/${selected.barcode_id}`);
      setMessage(t("inventory.barcode_removed"));
      await assets.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove barcode.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={t("nav.inventory")}
        title={t("inventory.stock_assets_title")}
        description={t("inventory.stock_assets_desc")}
      />
      {message && <div className="success-message">{message}</div>}
      {error && <div className="form-error">{error}</div>}
      <div className="stock-assets-layout">
        <section className="card">
          <div className="toolbar">
            <div className="search-box">
              <Icon name="search" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("inventory.search_assets_placeholder")}
                aria-label={t("inventory.stock_assets_title")}
              />
            </div>
            <select
              className="filter-select"
              value={assetFilter}
              onChange={(event) => setAssetFilter(event.target.value)}
              aria-label="Filter stock assets"
            >
              <option value="ALL">{t("inventory.all_assets")}</option>
              <option value="WITH_BARCODE">{t("inventory.with_barcode")}</option>
              <option value="WITHOUT_BARCODE">{t("inventory.missing_barcode")}</option>
            </select>
            <select
              className="filter-select"
              value={assetSort}
              onChange={(event) => setAssetSort(event.target.value)}
              aria-label="Sort stock assets"
            >
              <option value="PRODUCT_ASC">{t("catalog.product_name")} A–Z</option>
              <option value="PRODUCT_DESC">{t("catalog.product_name")} Z–A</option>
              <option value="ASSET_TAG">{t("catalog.sku")}</option>
              <option value="STATUS">{t("common.status")}</option>
            </select>
          </div>
          {assets.loading ? (
            <Loading />
          ) : assets.error ? (
            <EmptyState title="Stock assets could not load" message={assets.error} />
          ) : visible.length === 0 ? (
            <EmptyState
              title={t("inventory.no_assets_found")}
              message={t("inventory.no_assets_desc")}
            />
          ) : (
            <div className="stock-asset-list">
              {assetPagination.pageItems.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  className={`stock-product-row${asset.id === selectedId ? " selected" : ""}`}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <span className="stock-product-icon">
                    <Icon name="package" size={18} />
                  </span>
                  <span className="stock-product-name">
                    <strong>{asset.product_name}</strong>
                    <small>
                      {asset.variant_name} · {asset.asset_tag}
                    </small>
                  </span>
                  <span className="stock-product-balance">
                    <small>
                      {asset.barcode ? t("catalog.barcode") : t("inventory.missing_barcode")}
                    </small>
                    {asset.barcode ? (
                      <strong>{asset.barcode}</strong>
                    ) : (
                      <StatusBadge status={asset.status} />
                    )}
                  </span>
                  <Icon name={asset.id === selectedId ? "check" : "chevron"} size={16} />
                </button>
              ))}
            </div>
          )}
          <Pagination
            pageIndex={assetPagination.pageIndex}
            pageSize={assetPagination.pageSize}
            totalItems={assetPagination.totalItems}
            totalPages={assetPagination.totalPages}
            itemLabel={t("inventory.stock_assets_title")}
            onPageChange={assetPagination.setPageIndex}
          />
        </section>
        <section className="card stock-asset-editor">
          <div className="card-head">
            <div>
              <h2>{t("inventory.assign_stock_barcode")}</h2>
              <p>{t("inventory.assign_barcode_desc")}</p>
            </div>
          </div>
          {!selected ? (
            <EmptyState
              title={t("inventory.select_asset_prompt")}
              message={t("inventory.select_asset_desc")}
            />
          ) : (
            <>
              <div className="receipt-selection">
                <div>
                  <small>{t("catalog.product_name")}</small>
                  <strong>{selected.product_name}</strong>
                </div>
                <div>
                  <small>{t("catalog.sku")}</small>
                  <strong>{selected.asset_tag}</strong>
                </div>
                <div>
                  <small>{t("common.status")}</small>
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              <BarcodeScanner
                value={barcode}
                onChange={setBarcode}
                onScan={(value) => {
                  setBarcode(value);
                  void assign(value);
                }}
                placeholder={t("inventory.search_assets_placeholder")}
              />
              <div className="modal-actions">
                <Button
                  type="button"
                  onClick={() => void assign()}
                  disabled={busy || !barcode.trim()}
                >
                  {busy ? t("common.loading") : t("inventory.assign_barcode_button")}
                </Button>
                {selected.barcode_id && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void clearBarcode()}
                    disabled={busy}
                  >
                    {t("inventory.remove_barcode")}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

export function MovementsPage() {
  const { t } = useTranslation();
  const { merchant, isMerchant } = useAuth();
  const { currentShop } = useShop();
  const { data, loading, error } = useResource<Movement>(
    "/inventory/movements?page_index=0&page_size=200",
  );
  const variants = useResource<Variant>("/pos/catalog?page_index=0&page_size=500");
  const locations = useResource<Location>("/inventory/locations?page_index=0&page_size=200");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [movementSort, setMovementSort] = useState("NEWEST");
  const variantNames = useMemo(
    () => new Map(variants.data.map((item) => [item.id, item.name])),
    [variants.data],
  );
  const variantName = (id?: string) => (id ? (variantNames.get(id) ?? id.slice(0, 8)) : "—");
  const locationName = (id?: string) =>
    id ? (locations.data.find((item) => item.id === id)?.name ?? id.slice(0, 8)) : "—";
  const visible = useMemo(
    () =>
      data
        .filter(
          (item) =>
            (!type || item.movement_type === type) &&
            `${variantNames.get(item.variant_id) ?? item.variant_id ?? ""} ${item.event_key ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          movementSort === "OLDEST"
            ? new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
            : movementSort === "PRODUCT"
              ? (variantNames.get(a.variant_id) ?? a.variant_id ?? "").localeCompare(
                  variantNames.get(b.variant_id) ?? b.variant_id ?? "",
                )
              : movementSort === "QUANTITY_DESC"
                ? Number(b.quantity) - Number(a.quantity)
                : new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        ),
    [data, movementSort, query, type, variantNames],
  );
  const pagination = useListPagination(visible, 10, `${query}|${type}|${movementSort}`);
  return (
    <>
      <PageHeader
        eyebrow={t("nav.inventory")}
        title={t("inventory.stock_history_title")}
        description={t("inventory.stock_history_desc")}
        action={
          <Button variant="secondary" onClick={() => window.print()}>
            {t("common.print")}
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("common.search_placeholder")}
          />
        </div>
        <select
          className="filter-select"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">{t("inventory.all_movements")}</option>
          <option>RECEIPT</option>
          <option>SALE</option>
          <option>TRANSFER</option>
          <option>RETURN</option>
          <option>ADJUSTMENT</option>
          <option>REVERSAL</option>
        </select>
        <select
          className="filter-select"
          value={movementSort}
          onChange={(event) => setMovementSort(event.target.value)}
          aria-label="Sort movements"
        >
          <option value="NEWEST">Newest first</option>
          <option value="OLDEST">Oldest first</option>
          <option value="PRODUCT">Product A–Z</option>
          <option value="QUANTITY_DESC">Largest quantity</option>
        </select>
      </div>
      <div className="table-card">
        {loading ? (
          <Loading />
        ) : error ? (
          <EmptyState title="Movements could not load" message={error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="history"
            title={t("inventory.no_movements_found")}
            message={t("inventory.no_movements_desc")}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th>{t("common.status")}</th>
                <th>{t("catalog.product_name")}</th>
                <th>{t("inventory.location")}</th>
                <th>{t("common.quantity")}</th>
                {isMerchant && <th>{t("inventory.unit_cost")}</th>}
                <th>{t("common.details")}</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>{formatShopDateTime(item.occurred_at, currentShop?.timezone)}</td>
                  <td>
                    <Badge
                      tone={
                        item.movement_type === "RECEIPT"
                          ? "success"
                          : item.movement_type === "SALE"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {item.movement_type}
                    </Badge>
                  </td>
                  <td>
                    <strong>{variantName(item.variant_id)}</strong>
                  </td>
                  <td>
                    {locationName(item.source_location_id)} →{" "}
                    {locationName(item.destination_location_id)}
                  </td>
                  <td>
                    <strong>
                      {item.movement_type === "SALE" ? "−" : "+"}
                      {formatQuantity(item.quantity)}
                    </strong>
                  </td>
                  {isMerchant && (
                    <td>
                      {item.unit_cost
                        ? formatMoney(item.unit_cost, merchant?.default_currency_code)
                        : "—"}
                    </td>
                  )}
                  <td>
                    <code>{item.event_key}</code>
                    {isMerchant && (
                      <Link
                        className="history-detail-btn"
                        href={`/stock-history/${item.id}`}
                        style={{ marginLeft: "8px" }}
                        aria-label={`View detail for ${item.event_key}`}
                      >
                        <Icon name="eye" size={13} />
                        <span>{t("common.details")}</span>
                      </Link>
                    )}
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
        itemLabel={t("inventory.stock_history_title")}
        onPageChange={pagination.setPageIndex}
      />
    </>
  );
}

export function AccountsPage() {
  const { t } = useTranslation();
  const { isMerchant } = useAuth();
  const offline = useOffline();
  const users = useResource<User>("/users?page=1&page_size=100");
  const shops = useResource<Shop>("/shops?page_index=0&page_size=100");
  const roles = useResource<Role>("/roles");
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  const staffRole = useMemo(
    () => roles.data.find((role) => role.code?.toLowerCase() === "staff"),
    [roles.data],
  );

  const isAiChatAllowed = Boolean(staffRole?.permission_codes?.includes("ai.chat"));

  async function handleToggleAiChat(checked: boolean) {
    if (!isMerchant) return;
    if (!staffRole) {
      setPermissionError("Staff role could not be loaded for this merchant.");
      return;
    }
    if (offline.status === "offline") {
      setPermissionError("Role permission changes require an active connection.");
      return;
    }
    setPermissionBusy(true);
    setPermissionError("");
    try {
      const existingCodes = staffRole.permission_codes || [];
      const updatedCodes = checked
        ? Array.from(new Set([...existingCodes, "ai.chat"]))
        : existingCodes.filter((code) => code !== "ai.chat");

      await patch(`/roles/${staffRole.id}`, {
        permission_codes: updatedCodes,
      });
      await roles.reload();
    } catch (err) {
      setPermissionError(
        err instanceof Error ? err.message : "Failed to update staff AI assistant permission.",
      );
    } finally {
      setPermissionBusy(false);
    }
  }

  const [userQuery, setUserQuery] = useState("");
  const [userFilter, setUserFilter] = useState("ALL");
  const [userSort, setUserSort] = useState("NAME_ASC");
  const visibleUsers = useMemo(
    () =>
      users.data
        .filter(
          (user) =>
            `${user.display_name} ${user.email} ${user.phone ?? ""} ${user.roles.map((role) => role.name).join(" ")}`
              .toLowerCase()
              .includes(userQuery.toLowerCase()) &&
            (userFilter === "ALL" || (userFilter === "ACTIVE" ? user.is_active : !user.is_active)),
        )
        .sort((a, b) =>
          userSort === "NAME_DESC"
            ? b.display_name.localeCompare(a.display_name)
            : userSort === "EMAIL"
              ? a.email.localeCompare(b.email)
              : a.display_name.localeCompare(b.display_name),
        ),
    [userFilter, userQuery, userSort, users.data],
  );
  const userPagination = useListPagination(
    visibleUsers,
    10,
    `${userQuery}|${userFilter}|${userSort}`,
  );
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [staffPassword, setStaffPassword] = useState("");
  const [staffConfirmPassword, setStaffConfirmPassword] = useState("");
  const [passwordModalError, setPasswordModalError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline.status === "offline") {
      setFormError("Staff account changes require a connection.");
      return;
    }
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      await post("/users", {
        email: String(form.get("email")),
        password: String(form.get("password")),
        display_name: String(form.get("name")),
        phone: String(form.get("phone") || "") || undefined,
        shop_id: String(form.get("shop_id")),
        role_code: "STAFF",
      });
      setOpen(false);
      await users.reload();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to create staff account.");
    }
  }
  async function toggle(user: User) {
    if (offline.status === "offline") {
      setFormError("Staff account changes require a connection.");
      return;
    }
    await patch(`/users/${user.membership_id}`, { is_active: !user.is_active });
    await users.reload();
  }
  async function assign(user: User, shopId: string) {
    if (offline.status === "offline") {
      setFormError("Staff account changes require a connection.");
      return;
    }
    await patch(`/users/${user.membership_id}`, { shop_id: shopId });
    await users.reload();
  }
  async function submitStaffPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordUser) return;
    if (offline.status === "offline") {
      setPasswordModalError("Staff password changes require an active connection.");
      return;
    }
    if (staffPassword.length < 8) {
      setPasswordModalError("Password must be at least 8 characters long.");
      return;
    }
    if (staffPassword !== staffConfirmPassword) {
      setPasswordModalError("Passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    setPasswordModalError("");
    try {
      await patch(`/users/${passwordUser.membership_id}`, {
        password: staffPassword,
      });
      setPasswordUser(null);
      await users.reload();
    } catch (err) {
      setPasswordModalError(
        err instanceof Error ? err.message : "Failed to update staff password.",
      );
    } finally {
      setPasswordBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={t("accounts.eyebrow")}
        title={t("accounts.title")}
        description={t("accounts.description")}
        action={
          <Button icon="plus" disabled={offline.status === "offline"} onClick={() => setOpen(true)}>
            {t("accounts.add_staff")}
          </Button>
        }
      />
      {isMerchant && (
        <div className="table-card" style={{ marginBottom: 16, padding: "16px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <label
              className="check-field switch-field"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                cursor: isMerchant ? "pointer" : "default",
              }}
            >
              <input
                type="checkbox"
                role="switch"
                checked={isAiChatAllowed}
                disabled={
                  !isMerchant || offline.status === "offline" || permissionBusy || roles.loading
                }
                onChange={(event) => handleToggleAiChat(event.target.checked)}
                aria-label={t("accounts.staff_ai_chat_permission", "Staff Nanonux AI Permission")}
              />
              <span>
                <strong style={{ fontSize: 13, fontWeight: 600 }}>
                  {t("accounts.staff_ai_chat_permission", "Staff Nanonux AI Permission")}
                </strong>
                <small style={{ fontSize: 11, color: "var(--muted)" }}>
                  {t(
                    "accounts.staff_ai_chat_desc",
                    "Allow staff to access Nanonux AI Assistant for operational queries and inventory analysis.",
                  )}
                </small>
              </span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Badge tone={isAiChatAllowed ? "success" : "neutral"}>
                {permissionBusy
                  ? t("common.loading", "Loading…")
                  : isAiChatAllowed
                    ? t("accounts.ai_chat_enabled", "AI Allowed")
                    : t("accounts.ai_chat_disabled", "AI Off")}
              </Badge>
            </div>
          </div>
          {permissionError && (
            <p className="error banner" style={{ marginTop: 10, marginBottom: 0 }}>
              {permissionError}
            </p>
          )}
        </div>
      )}
      <ListControls
        search={userQuery}
        onSearchChange={setUserQuery}
        searchPlaceholder={t("common.search_placeholder")}
        filter={userFilter}
        onFilterChange={setUserFilter}
        filterLabel={t("common.filter")}
        filterOptions={[
          { value: "ALL", label: t("common.all") },
          { value: "ACTIVE", label: t("common.active") },
          { value: "INACTIVE", label: t("common.inactive") },
        ]}
        sort={userSort}
        onSortChange={setUserSort}
        sortLabel={t("common.actions")}
        sortOptions={[
          { value: "NAME_ASC", label: `${t("common.name")} A–Z` },
          { value: "NAME_DESC", label: `${t("common.name")} Z–A` },
          { value: "EMAIL", label: `${t("common.email")} A–Z` },
        ]}
      />
      <div className="table-card">
        {users.loading ? (
          <Loading />
        ) : users.error ? (
          <EmptyState title="Staff could not load" message={users.error} />
        ) : visibleUsers.length === 0 ? (
          <EmptyState
            icon="users"
            title={t("accounts.no_staff_accounts")}
            message={t("accounts.no_staff_desc")}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("accounts.team_member")}</th>
                <th>{t("accounts.role")}</th>
                <th>{t("accounts.assigned_shop")}</th>
                <th>{t("common.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {userPagination.pageItems.map((user) => (
                <tr key={user.membership_id}>
                  <td>
                    <div className="person-cell">
                      <span>
                        {user.display_name
                          .split(/\s+/)
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div className="cell-main">
                        <strong>{user.display_name}</strong>
                        <small>{user.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{user.roles.map((role) => role.name).join(", ") || "No role"}</td>
                  <td>
                    {user.roles.some((role) => role.code.toUpperCase() === "STAFF") ? (
                      <select
                        value={user.shop_id ?? ""}
                        disabled={offline.status === "offline"}
                        onChange={(event) => assign(user, event.target.value)}
                        aria-label={`Shop for ${user.display_name}`}
                      >
                        <option value="" disabled>
                          {t("accounts.assign_shop")}
                        </option>
                        {shops.data.map((shop) => (
                          <option key={shop.id} value={shop.id}>
                            {shop.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (shops.data.find((shop) => shop.id === user.shop_id)?.name ??
                      t("accounts.all_shops"))
                    )}
                  </td>
                  <td>
                    <Badge tone={user.is_active ? "success" : "neutral"}>
                      {user.is_active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        title={t("accounts.change_password")}
                        disabled={offline.status === "offline"}
                        onClick={() => {
                          setPasswordUser(user);
                          setStaffPassword("");
                          setStaffConfirmPassword("");
                          setPasswordModalError("");
                        }}
                      >
                        <Icon name="lock" size={15} />
                      </button>
                      <button
                        title={user.is_active ? "Deactivate" : "Activate"}
                        disabled={offline.status === "offline"}
                        onClick={() => toggle(user)}
                      >
                        <Icon name={user.is_active ? "close" : "check"} size={15} />
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
        pageIndex={userPagination.pageIndex}
        pageSize={userPagination.pageSize}
        totalItems={userPagination.totalItems}
        totalPages={userPagination.totalPages}
        itemLabel={t("accounts.title")}
        onPageChange={userPagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("accounts.add_staff_modal_title")}
        description={t("accounts.add_staff_modal_desc")}
      >
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field label={t("accounts.full_name")}>
              <input name="name" required />
            </Field>
            <Field label={t("common.phone")}>
              <input name="phone" type="tel" />
            </Field>
            <div className="wide">
              <Field label={t("common.email")}>
                <input name="email" type="email" required />
              </Field>
            </div>
            <Field label={t("accounts.temporary_password")}>
              <input name="password" type="password" minLength={8} required />
            </Field>
            <Field label={t("accounts.assigned_shop")}>
              <select name="shop_id" required>
                <option value="">{t("accounts.assign_shop")}</option>
                {shops.data.map((shop) => (
                  <option value={shop.id} key={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={offline.status === "offline"}>
              {t("accounts.create_staff")}
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        open={Boolean(passwordUser)}
        onClose={() => setPasswordUser(null)}
        title={`${t("accounts.change_password")}: ${passwordUser?.display_name ?? ""}`}
        description={`Set a new sign-in password for ${passwordUser?.email ?? "this staff member"}.`}
      >
        <Form onSubmit={submitStaffPassword}>
          <div className="form-grid">
            {passwordModalError && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "0.75rem",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                }}
              >
                {passwordModalError}
              </div>
            )}
            <Field label={t("accounts.new_password")} hint="Minimum 8 characters">
              <input
                type="password"
                required
                minLength={8}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder={t("accounts.new_password")}
              />
            </Field>
            <Field label={t("accounts.confirm_password")} hint="Retype to confirm">
              <input
                type="password"
                required
                minLength={8}
                value={staffConfirmPassword}
                onChange={(e) => setStaffConfirmPassword(e.target.value)}
                placeholder={t("accounts.confirm_password")}
              />
            </Field>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setPasswordUser(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" icon="lock" disabled={passwordBusy || !staffPassword}>
              {passwordBusy ? t("common.loading") : t("accounts.update_password")}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
