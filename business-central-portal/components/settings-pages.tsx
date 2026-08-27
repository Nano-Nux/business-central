"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Icon } from "./icons";
import { Badge, Button, EmptyState, Field, Form, Loading, PageHeader, StatusBadge } from "./ui";
import {
  bluetoothAvailable,
  connectPrinter,
  storedPrinterFontSizePx,
  storedPrinterPaperWidthMm,
  scanPrinter,
  usingNativePrinterBridge,
  type PrinterDevice,
} from "@/lib/thermal-printer";
import { patch, post, remove } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import type { CustomFieldDefinition, Merchant, Shop } from "@/lib/types";
import { useShop } from "@/lib/shop";
import { InvoiceReceipt } from "./invoice-receipt";
import { ImageSourceField, imageAction, prepareImageSubmissions } from "./image-source-input";
import { useAuth } from "@/lib/auth";
import type { Invoice } from "@/lib/types";
import { useOffline } from "@/lib/offline";
import { queueShopSettingsUpdate } from "@/lib/offline-settings";
import { queueMerchantUpdate } from "@/lib/offline-merchant";
import { imageUploadMarker } from "@/lib/offline-images";
import { putCachedResource } from "@/lib/offline-db";
import { formatShopAddress } from "@/lib/shop-address";
import { currencyLabel } from "@/lib/currency";

export function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage your business details and how invoices are printed."
      />
      <div className="settings-grid">
        <Link href="/settings/payment-types" className="settings-card">
          <span className="stat-icon mint"><Icon name="receipt" /></span>
          <div><h2>Payment types</h2><p>Merchant-wide Cash, Online, and future Digital payment choices.</p></div>
          <Icon name="arrow" />
        </Link>
        <Link href="/settings/merchant" className="settings-card">
          <span className="stat-icon mint">
            <Icon name="store" />
          </span>
          <div>
            <h2>Merchant & shops</h2>
            <p>Business identity, contact details, shops and operating timezone.</p>
          </div>
          <Icon name="arrow" />
        </Link>
        <Link href="/settings/printer" className="settings-card">
          <span className="stat-icon blue">
            <Icon name="printer" />
          </span>
          <div>
            <h2>Printer</h2>
            <p>Bluetooth permission, device connection, image proof and font sizing.</p>
          </div>
          <Icon name="arrow" />
        </Link>
        <Link href="/settings/application" className="settings-card">
          <span className="stat-icon amber">
            <Icon name="settings" />
          </span>
          <div>
            <h2>Application</h2>
            <p>Startup behavior, confirmations and operational display preferences.</p>
          </div>
          <Icon name="arrow" />
        </Link>
        <Link href="/settings/tax-notes" className="settings-card">
          <span className="stat-icon purple">
            <Icon name="receipt" />
          </span>
          <div>
            <h2>Tax & receipt notes</h2>
            <p>Receipt wording, tax display and customer-facing notes.</p>
          </div>
          <Icon name="arrow" />
        </Link>
        <Link href="/settings/staff" className="settings-card">
          <span className="stat-icon blue">
            <Icon name="users" />
          </span>
          <div>
            <h2>Staff settings</h2>
            <p>Counter permissions and staff-facing workflow defaults.</p>
          </div>
          <Icon name="arrow" />
        </Link>
        <Link href="/settings/repair-specs" className="settings-card">
          <span className="stat-icon mint">
            <Icon name="repair" />
          </span>
          <div>
            <h2>Repair specifications</h2>
            <p>Fault presets and repair intake defaults.</p>
          </div>
          <Icon name="arrow" />
        </Link>
      </div>
    </>
  );
}

export function OperationalSettingsPage({
  section,
}: {
  section: "application" | "tax-notes" | "staff" | "repair-specs";
}) {
  const labels = {
    application: ["Application settings", "Choose the defaults used by the counter application."],
    "tax-notes": [
      "Tax & receipt notes",
      "Set the notes and display preferences printed for customers.",
    ],
    staff: ["Staff settings", "Control the defaults that keep staff workflows consistent."],
    "repair-specs": ["Repair specifications", "Keep common faults ready for fast repair intake."],
  } as const;
  const [message, setMessage] = useState("");
  const { currentShop, shops, selectShop } = useShop();
  const offline = useOffline();
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(`bc.settings.${section}`) ?? "{}");
    } catch {
      return {};
    }
  });
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (section === "tax-notes" && currentShop) {
      try {
        if (!offline.scope) {
          throw new Error("An authenticated merchant workspace is required.");
        }
        await queueShopSettingsUpdate(offline.scope, currentShop, {
          name: currentShop.name,
          code: currentShop.code,
          timezone: currentShop.timezone,
          address: currentShop.address ?? {},
          is_active: currentShop.is_active,
          include_tax: (values.includeTax ?? String(Boolean(currentShop.include_tax))) === "true",
          tax_rate: values.taxRate ?? currentShop.tax_rate ?? "0",
          tax_label: values.taxLabel ?? currentShop.tax_label ?? "Tax",
          receipt_note: values.receiptNote ?? currentShop.receipt_note ?? "",
          footer_note: currentShop.footer_note ?? "",
        });
        if (!navigator.onLine) {
          setMessage("Saved on this device. The change is pending sync.");
          return;
        }
        const result = await offline.syncNow();
        setMessage(
          result && result.conflicts === 0 && result.rejected === 0
            ? "Tax settings saved and synchronized for this shop."
            : result?.conflicts
              ? "Saved locally, but the server reported a settings conflict."
              : result?.rejected
                ? "Saved locally, but the server rejected this change."
                : "Saved on this device. Synchronization will retry.",
        );
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "Tax settings could not be saved.");
      }
      return;
    }
    localStorage.setItem(`bc.settings.${section}`, JSON.stringify(values));
    setMessage("Settings saved for this shop.");
  }
  const fields =
    section === "application"
      ? [
          ["defaultView", "Default landing view"],
          ["currencyDisplay", "Currency display"],
        ]
      : section === "tax-notes"
        ? [
            ["receiptNote", "Receipt footer note"],
            ["taxLabel", "Tax label"],
          ]
        : section === "staff"
          ? [
              ["defaultStatus", "Default ticket status"],
              ["confirmation", "Confirmation behavior"],
            ]
          : [
              ["faultPresets", "Fault presets (comma separated)"],
              ["defaultDuration", "Default repair duration"],
            ];
  if (section === "repair-specs") return <RepairFormSettingsPage />;
  if (section === "tax-notes")
    return (
      <>
        <PageHeader
          eyebrow="Settings"
          title="Tax & receipt notes"
          description="Tax is configured per shop and is hidden from totals and documents when disabled."
        />
        <Form className="card settings-stack" onSubmit={save}>
          <Field label="Shop">
            <select
              value={currentShop?.id ?? ""}
              onChange={(event) => selectShop(event.target.value)}
            >
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              checked={
                values.includeTax === "true" ||
                (values.includeTax === undefined && Boolean(currentShop?.include_tax))
              }
              onChange={(event) =>
                setValues({
                  ...values,
                  includeTax: String(event.target.checked),
                })
              }
            />
            <span>
              <strong>Include tax</strong>
              <small>Show and calculate tax for this shop.</small>
            </span>
          </label>
          <Field label="Tax rate (%)">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={values.taxRate ?? currentShop?.tax_rate ?? "0"}
              onChange={(event) => setValues({ ...values, taxRate: event.target.value })}
            />
          </Field>
          <Field label="Tax label">
            <input
              value={values.taxLabel ?? currentShop?.tax_label ?? "Tax"}
              onChange={(event) => setValues({ ...values, taxLabel: event.target.value })}
            />
          </Field>
          <Field label="Receipt footer note">
            <input
              value={values.receiptNote ?? currentShop?.receipt_note ?? ""}
              onChange={(event) => setValues({ ...values, receiptNote: event.target.value })}
            />
          </Field>
          <Button type="submit">Save settings</Button>
          {message && <div className="notice">{message}</div>}
        </Form>
      </>
    );
  return (
    <>
      <PageHeader eyebrow="Settings" title={labels[section][0]} description={labels[section][1]} />
      <Form className="card settings-stack" onSubmit={save}>
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              value={values[key] ?? ""}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
          </Field>
        ))}
        <Button type="submit">Save settings</Button>
        {message && <div className="notice">{message}</div>}
      </Form>
    </>
  );
}

function RepairFormSettingsPage() {
  const offline = useOffline();
  const { currentShop } = useShop();
  const definitions = useResource<CustomFieldDefinition>(
    "/services/forms/definitions?page_index=0&page_size=200&filter=service_type:REPAIR",
  );
  const [message, setMessage] = useState("");
  const [showDeviceType, setShowDeviceType] = useState(false);
  const [showDeviceBrand, setShowDeviceBrand] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowDeviceType(currentShop?.show_device_type_in_repair_invoice === true);
      setShowDeviceBrand(currentShop?.show_device_brand_in_repair_invoice === true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentShop]);
  async function saveInvoiceDisplaySetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentShop) return;
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save this repair invoice setting.");
      }
      const update = {
        name: currentShop.name,
        code: currentShop.code,
        timezone: currentShop.timezone,
        address: {
          ...(currentShop.address ?? {}),
          show_device_type_in_repair_invoice: String(showDeviceType),
          show_device_brand_in_repair_invoice: String(showDeviceBrand),
        },
        footer_note: currentShop.footer_note ?? "",
        is_active: currentShop.is_active,
        include_tax: currentShop.include_tax ?? false,
        tax_rate: currentShop.tax_rate ?? "0",
        tax_label: currentShop.tax_label ?? "Tax",
        receipt_note: currentShop.receipt_note ?? "",
      };
      if (offline.scope && offline.storageAvailable) {
        await queueShopSettingsUpdate(offline.scope, currentShop, update);
        if (navigator.onLine) await offline.syncNow();
        setMessage(
          navigator.onLine
            ? "Repair invoice display setting saved and synchronized for this shop."
            : "Repair invoice display setting saved locally; synchronization is pending.",
        );
      } else {
        await patch(`/shops/${currentShop.id}`, {
          ...update,
          module_codes: currentShop.module_codes,
        });
        setMessage("Repair invoice display setting saved for this shop.");
      }
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Repair invoice display setting could not be saved.",
      );
    }
  }
  async function createDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline.status === "offline") {
      setMessage("Connect to update the shared form definition.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const scope = String(form.get("field_scope"));
    const options = String(form.get("options") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({ value, label: value }));
    try {
      await post("/services/forms/definitions", {
        entity_type: scope === "TICKET" ? "REPAIR_TICKET" : "REPAIR_WORK_ITEM",
        module_code: "REPAIR",
        service_type: "REPAIR",
        field_scope: scope,
        field_code: String(form.get("field_code")).trim(),
        label: String(form.get("label")).trim(),
        value_type: String(form.get("value_type")),
        is_required: form.get("required") === "on",
        printable: form.get("printable") === "on",
        section: String(form.get("section") || "").trim() || undefined,
        display_order: Number(form.get("display_order") || 0),
        options,
        validation_rules: {},
        visibility_rules: {},
        is_active: true,
      });
      event.currentTarget.reset();
      setMessage("Form field created. New tickets will use the updated form version.");
      await definitions.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Form field could not be created.");
    }
  }
  async function deactivate(id: string) {
    if (offline.status === "offline") {
      setMessage("Connect to update the shared form definition.");
      return;
    }
    try {
      await remove(`/services/forms/definitions/${id}`);
      setMessage("Field deactivated. Existing ticket values remain unchanged.");
      await definitions.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Field could not be deactivated.");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Repair form specifications"
        description="Configure versioned ticket and device fields rendered during repair intake and on printable invoices."
      />
      <Form className="card settings-stack" onSubmit={saveInvoiceDisplaySetting}>
        <div className="card-head">
          <div>
            <h2>Repair invoice display</h2>
            <p>Choose which device details customers see in previews and printed invoices.</p>
          </div>
        </div>
        <label className="check-field switch-field">
          <input
            type="checkbox"
            role="switch"
            checked={showDeviceType}
            onChange={(event) => setShowDeviceType(event.target.checked)}
          />
          <span>
            <strong>Show device type</strong>
            <small>
              Shows values such as phone or laptop on repair invoice previews and prints. Off by
              default.
            </small>
          </span>
        </label>
        <label className="check-field switch-field">
          <input
            type="checkbox"
            role="switch"
            checked={showDeviceBrand}
            onChange={(event) => setShowDeviceBrand(event.target.checked)}
          />
          <span>
            <strong>Show brand</strong>
            <small>
              Shows the device brand on repair invoice previews and prints. Off by default.
            </small>
          </span>
        </label>
        <Button type="submit" disabled={offline.status === "offline" && !offline.storageAvailable}>
          Save invoice display
        </Button>
      </Form>
      <Form className="card settings-stack" onSubmit={createDefinition}>
        <div className="form-grid">
          <Field label="Scope">
            <select name="field_scope" defaultValue="WORK_ITEM">
              <option value="TICKET">Shared ticket</option>
              <option value="WORK_ITEM">Each device</option>
            </select>
          </Field>
          <Field label="Field type">
            <select name="value_type" defaultValue="TEXT">
              <option>TEXT</option>
              <option>NUMBER</option>
              <option>BOOLEAN</option>
              <option>DATE</option>
              <option>SELECT</option>
              <option>JSON</option>
            </select>
          </Field>
          <Field label="Field code">
            <input
              name="field_code"
              pattern="[A-Za-z0-9_-]+"
              required
              placeholder="battery_health"
            />
          </Field>
          <Field label="Customer-facing label">
            <input name="label" required placeholder="Battery health" />
          </Field>
          <Field label="Section">
            <input name="section" placeholder="Device condition" />
          </Field>
          <Field label="Display order">
            <input name="display_order" type="number" defaultValue="0" />
          </Field>
          <div className="wide">
            <Field label="Select options (comma separated)">
              <input name="options" placeholder="Good, Fair, Replace" />
            </Field>
          </div>
          <label className="check-field">
            <input name="required" type="checkbox" />
            <span>
              <strong>Required</strong>
              <small>Backend validation blocks incomplete intake.</small>
            </span>
          </label>
          <label className="check-field">
            <input name="printable" type="checkbox" />
            <span>
              <strong>Print on invoice</strong>
              <small>Expose this value in canonical receipt projections.</small>
            </span>
          </label>
        </div>
        <Button type="submit" disabled={offline.status === "offline"}>
          Add form field
        </Button>
        {message && <div className="notice">{message}</div>}
      </Form>
      <section className="card settings-stack">
        <div className="card-head">
          <div>
            <h2>Active repair fields</h2>
            <p>Definitions are versioned; deactivation never rewrites historical values.</p>
          </div>
        </div>
        {definitions.loading ? (
          <Loading />
        ) : definitions.data.length === 0 ? (
          <EmptyState
            icon="repair"
            title="No custom fields"
            message="Repair intake currently uses only the canonical device and issue fields."
          />
        ) : (
          <div className="variant-list">
            {definitions.data
              .filter((item) => item.is_active)
              .map((item) => (
                <div key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>
                      {item.field_scope.replace("_", " ")} · {item.value_type} · version{" "}
                      {item.form_version}
                      {item.printable ? " · printable" : ""}
                    </small>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void deactivate(item.id)}
                  >
                    Deactivate
                  </Button>
                </div>
              ))}
          </div>
        )}
      </section>
    </>
  );
}

export function MerchantSettingsPage() {
  const { merchant: authenticatedMerchant } = useAuth();
  const offline = useOffline();
  const shopsPath = "/shops?page_index=0&page_size=100";
  const shops = useResource<Shop>(shopsPath);
  const [merchantOverride, setMerchantOverride] = useState<Merchant | null>(null);
  const merchant =
    merchantOverride?.id === authenticatedMerchant?.id ? merchantOverride : authenticatedMerchant;
  const loading = !merchant;
  const [message, setMessage] = useState("");
  async function saveMerchant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const body = {
        name: String(values.get("name")),
        legal_name: String(values.get("legal_name") || "") || undefined,
        country_code: String(values.get("country_code") || "") || undefined,
      };
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error(
          "Offline storage is required to save merchant settings while disconnected.",
        );
      }
      if (offline.scope && offline.storageAvailable && merchant) {
        const updated = { ...merchant, ...body };
        await queueMerchantUpdate(offline.scope, merchant, body);
        setMerchantOverride(updated);
        if (navigator.onLine) await offline.syncNow();
      } else {
        const updated = await patch<Merchant>("/merchant", body);
        setMerchantOverride(updated);
      }
      setMessage("Merchant details saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Merchant details could not be saved.");
    }
  }
  async function saveShop(event: FormEvent<HTMLFormElement>, shop: Shop) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const logoAction = imageAction(values, "shop_logo");
      const currentLogoUrl = shop.logo_url || shop.address?.logo_url;
      const logo = (
        await prepareImageSubmissions(values, "shop_logo", {
          deferUploads: offline.status === "offline" || !navigator.onLine,
        })
      )[0];
      const offlineLogoUpload = logo && "offline_upload" in logo ? logo.offline_upload : undefined;
      const logoUrl =
        logoAction === "REMOVE"
          ? ""
          : offlineLogoUpload
            ? imageUploadMarker(offlineLogoUpload.id)
            : (logo?.image_url ?? currentLogoUrl ?? "");
      const logoSourceType =
        logoAction === "REMOVE"
          ? ""
          : (logo?.source_type ?? shop.logo_source_type ?? shop.address?.logo_source_type ?? "");
      const body = {
        name: String(values.get("name")),
        code: String(values.get("code")),
        timezone: String(values.get("timezone")),
        is_active: values.get("active") === "on",
        address: {
          line1: String(values.get("address") || ""),
          city: String(values.get("city") || ""),
          logo_url: logoUrl,
          logo_source_type: logoSourceType,
          contact_info: String(values.get("contact_info") || ""),
        },
        footer_note: shop.footer_note ?? "",
        include_tax: shop.include_tax ?? false,
        tax_rate: shop.tax_rate ?? "0",
        tax_label: shop.tax_label ?? "Tax",
        receipt_note: shop.receipt_note ?? "",
      };
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save shop settings while disconnected.");
      }
      let queued = false;
      if (offline.scope && offline.storageAvailable) {
        await queueShopSettingsUpdate(offline.scope, shop, body, {
          offlineImageUploads: offlineLogoUpload ? [offlineLogoUpload] : [],
          localLogoUrl: offlineLogoUpload
            ? `data:${offlineLogoUpload.content_type};base64,${offlineLogoUpload.data_base64}`
            : undefined,
        });
        queued = true;
      } else await patch(`/shops/${shop.id}`, body);
      const localLogoUrl = offlineLogoUpload
        ? `data:${offlineLogoUpload.content_type};base64,${offlineLogoUpload.data_base64}`
        : undefined;
      const optimisticAddress: Record<string, string> = { ...(shop.address ?? {}) };
      for (const [key, value] of Object.entries(body.address)) {
        if (typeof value === "string") optimisticAddress[key] = value;
      }
      if (localLogoUrl) optimisticAddress.logo_url = localLogoUrl;
      const optimisticShop: Shop = {
        ...shop,
        name: body.name,
        code: body.code,
        timezone: body.timezone,
        is_active: body.is_active,
        address: optimisticAddress,
        logo_url: localLogoUrl ?? (typeof logoUrl === "string" ? logoUrl : (currentLogoUrl ?? "")),
        logo_source_type: logoSourceType,
        contact_info: body.address.contact_info,
        footer_note: body.footer_note,
        include_tax: body.include_tax,
        tax_rate: body.tax_rate,
        tax_label: body.tax_label,
        receipt_note: body.receipt_note,
      };
      const nextShops = shops.data.map((item) => (item.id === shop.id ? optimisticShop : item));
      shops.updateLocal(() => nextShops);
      if (queued && !navigator.onLine && offline.scope && offline.storageAvailable) {
        await putCachedResource(offline.scope, shopsPath, nextShops, shops.meta);
      }
      setMessage(`${String(values.get("name"))} saved.`);
      if (navigator.onLine) {
        if (queued) await offline.syncNow();
        await shops.reload();
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Shop details could not be saved.");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Merchant & shops"
        description="Keep the tenant details shown to staff and printed on customer documents accurate."
      />
      <section className="settings-stack">
        {loading ? (
          <Loading />
        ) : (
          merchant && (
            <Form className="card" onSubmit={saveMerchant}>
              <div className="card-head">
                <div>
                  <h2>Merchant profile</h2>
                  <p>Canonical tenant identity and regional defaults</p>
                </div>
                <Badge tone={merchant.is_active ? "success" : "danger"}>
                  {merchant.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="form-grid">
                <Field label="Trading name">
                  <input name="name" defaultValue={merchant.name} required />
                </Field>
                <Field label="Legal name">
                  <input name="legal_name" defaultValue={merchant.legal_name} />
                </Field>
                <Field label="Country code">
                  <input name="country_code" defaultValue={merchant.country_code} maxLength={2} />
                </Field>
                <Field label="Currency">
                  <input value={currencyLabel(merchant.default_currency_code)} disabled />
                </Field>
                <Field label="Merchant slug">
                  <input value={merchant.slug} disabled />
                </Field>
              </div>
              <div className="modal-actions">
                <Button
                  type="submit"
                  disabled={offline.status === "offline" && !offline.storageAvailable}
                >
                  Save merchant
                </Button>
              </div>
            </Form>
          )
        )}
        {shops.loading ? (
          <Loading />
        ) : shops.error ? (
          <EmptyState icon="store" title="Shops could not load" message={shops.error} />
        ) : (
          shops.data.map((shop) => (
            <Form className="card" key={shop.id} onSubmit={(event) => saveShop(event, shop)}>
              <div className="card-head">
                <div>
                  <h2>{shop.name}</h2>
                  <p>Shop identity, address and operating timezone</p>
                </div>
                <Badge tone={shop.is_active ? "success" : "neutral"}>
                  {shop.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="form-grid">
                <Field label="Shop name">
                  <input name="name" defaultValue={shop.name} required />
                </Field>
                <Field label="Shop code">
                  <input name="code" defaultValue={shop.code} required />
                </Field>
                <Field label="Address">
                  <input name="address" defaultValue={shop.address?.line1} />
                </Field>
                <Field label="City">
                  <input name="city" defaultValue={shop.address?.city} />
                </Field>
                <Field label="Shop contact info">
                  <input
                    name="contact_info"
                    defaultValue={shop.contact_info ?? shop.address?.contact_info}
                    placeholder="Phone, email or website"
                  />
                </Field>
                <ImageSourceField
                  key={`${shop.id}:${shop.logo_url || shop.address?.logo_url || ""}`}
                  name="shop_logo"
                  label="Shop logo"
                  currentUrl={shop.logo_url || shop.address?.logo_url}
                  emptyMessage="No saved logo for this shop yet."
                  disabled={offline.status === "offline" && !offline.storageAvailable}
                />
                <div className="wide">
                  <Field label="Timezone">
                    <input name="timezone" defaultValue={shop.timezone} required />
                  </Field>
                </div>
                <label className="check-field wide">
                  <input type="checkbox" name="active" defaultChecked={shop.is_active} />
                  <span>
                    <strong>Shop active</strong>
                    <small>Available for staff assignment and operations</small>
                  </span>
                </label>
              </div>
              <div className="modal-actions">
                <Button
                  type="submit"
                  disabled={offline.status === "offline" && !offline.storageAvailable}
                >
                  Save shop
                </Button>
              </div>
            </Form>
          ))
        )}
        {message && <div className="notice">{message}</div>}
      </section>
    </>
  );
}

export function PrinterSettingsPage() {
  const { currentShop } = useShop();
  const { merchant } = useAuth();
  const offline = useOffline();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connected, setConnected] = useState("");
  const [busy, setBusy] = useState(false);
  const [nativeBridge, setNativeBridge] = useState(false);
  const [message, setMessage] = useState("");
  const [showLogo, setShowLogo] = useState(true);
  const [showDeviceCompletionStatus, setShowDeviceCompletionStatus] = useState(false);
  const [footerNote, setFooterNote] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem("bc.printer.footerNote") ?? ""),
  );
  const [paperWidthMm, setPaperWidthMm] = useState(storedPrinterPaperWidthMm);
  const [fontSizePx, setFontSizePx] = useState(storedPrinterFontSizePx);
  useEffect(() => {
    if (!currentShop) return;
    const timer = window.setTimeout(() => {
      setFooterNote(currentShop.footer_note ?? currentShop.address?.footer_note ?? "");
      setShowLogo(currentShop.show_logo_in_printed_invoice !== false);
      setShowDeviceCompletionStatus(currentShop.show_device_completion_status === true);
      setPaperWidthMm(storedPrinterPaperWidthMm(currentShop));
      setFontSizePx(storedPrinterFontSizePx(currentShop));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentShop]);
  async function checkBluetooth(notify = true) {
    const next = await bluetoothAvailable();
    setAvailable(next);
    if (notify)
      setMessage(
        next
          ? "Bluetooth is available. Scanning will request device permission."
          : "Bluetooth is unavailable. Use Chrome or Edge over HTTPS and enable Bluetooth.",
      );
  }
  useEffect(() => {
    const refresh = () => {
      setNativeBridge(usingNativePrinterBridge());
      bluetoothAvailable().then(setAvailable);
    };
    refresh();
    window.addEventListener("business-central-native-printer-ready", refresh);
    return () => window.removeEventListener("business-central-native-printer-ready", refresh);
  }, []);
  async function scan() {
    setBusy(true);
    setMessage("");
    try {
      const device = await scanPrinter();
      setDevices((current) =>
        current.some((item) => item.id === device.id) ? current : [...current, device],
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No printer selected.");
    } finally {
      setBusy(false);
    }
  }
  async function connect(device: PrinterDevice) {
    setBusy(true);
    try {
      await connectPrinter(device);
      setConnected(device.id);
      localStorage.setItem("bc.printer.name", device.name);
      setMessage(`${device.name} is connected and ready.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }
  function changePaperWidth(value: number) {
    setPaperWidthMm(value);
    if (currentShop)
      localStorage.setItem(`bc.printer.paperWidthMm.${currentShop.id}`, String(value));
  }
  function changeFontSize(value: number) {
    setFontSizePx(value);
    if (currentShop) localStorage.setItem(`bc.printer.fontSizePx.${currentShop.id}`, String(value));
  }
  async function savePrinterSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentShop) return;
    localStorage.setItem(`bc.printer.footerNote.${currentShop.id}`, footerNote);
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save the footer note while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queueShopSettingsUpdate(offline.scope, currentShop, {
          name: currentShop.name,
          code: currentShop.code,
          timezone: currentShop.timezone,
          address: {
            ...(currentShop.address ?? {}),
            show_logo_in_printed_invoice: String(showLogo),
            show_device_completion_status: String(showDeviceCompletionStatus),
            printer_paper_width_mm: String(paperWidthMm),
            printer_font_size_px: String(fontSizePx),
          },
          footer_note: footerNote,
          is_active: currentShop.is_active,
          include_tax: currentShop.include_tax ?? false,
          tax_rate: currentShop.tax_rate ?? "0",
          tax_label: currentShop.tax_label ?? "Tax",
          receipt_note: currentShop.receipt_note ?? "",
        });
        if (navigator.onLine) await offline.syncNow();
        setMessage(
          navigator.onLine
            ? "Printer settings saved and synchronized for this shop."
            : "Printer settings saved locally; synchronization is pending.",
        );
      } else {
        await patch(`/shops/${currentShop.id}`, {
          name: currentShop.name,
          code: currentShop.code,
          timezone: currentShop.timezone,
          address: {
            ...(currentShop.address ?? {}),
            show_logo_in_printed_invoice: String(showLogo),
            show_device_completion_status: String(showDeviceCompletionStatus),
            printer_paper_width_mm: String(paperWidthMm),
            printer_font_size_px: String(fontSizePx),
          },
          footer_note: footerNote,
          is_active: currentShop.is_active,
          module_codes: currentShop.module_codes,
        });
        setMessage("Printer settings saved for this shop.");
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Printer settings could not be saved.");
    }
  }
  const sharedPreview = {
    currencyCode: merchant?.default_currency_code ?? "USD",
    shopName: currentShop?.name,
    shopTimezone: currentShop?.timezone,
    logoUrl: currentShop?.logo_url,
    showLogo,
    showDeviceCompletionStatus,
    showDeviceType: currentShop?.show_device_type_in_repair_invoice === true,
    showDeviceBrand: currentShop?.show_device_brand_in_repair_invoice === true,
    shopAddress: formatShopAddress(currentShop?.address),
    shopContact: currentShop?.contact_info,
    footerNote: footerNote,
    receiptNote: currentShop?.receipt_note,
    taxLabel: currentShop?.tax_label,
    createdAt: new Date().toISOString(),
    status: "Paid" as const,
  };
  const posPreview: Invoice = {
    ...sharedPreview,
    id: "pos-preview",
    number: "POS-PREVIEW",
    customer: "Walk-in customer",
    subtotal: 24,
    discount: 0,
    tax: currentShop?.include_tax ? (24 * Number(currentShop.tax_rate || 0)) / 100 : 0,
    total: 24 + (currentShop?.include_tax ? (24 * Number(currentShop.tax_rate || 0)) / 100 : 0),
    items: [{ name: "Example product", quantity: 1, price: 24 }],
  };
  const repairPreview: Invoice = {
    ...sharedPreview,
    id: "repair-preview",
    number: "REPAIR-PREVIEW",
    customer: "Repair customer",
    kind: "repair",
    paymentStatus: "Deposit",
    modelNumber: [
      ...(currentShop?.show_device_type_in_repair_invoice === true ? ["PHONE"] : []),
      ...(currentShop?.show_device_brand_in_repair_invoice === true ? ["Example"] : []),
      "Example model",
    ].join(" · "),
    errorDescription: "Screen replacement",
    imeiNumber: "356789012345678",
    subtotal: 145,
    discount: 0,
    tax: currentShop?.include_tax ? (145 * Number(currentShop.tax_rate || 0)) / 100 : 0,
    total: 145 + (currentShop?.include_tax ? (145 * Number(currentShop.tax_rate || 0)) / 100 : 0),
    note: "Device: Phone · Issue: screen replacement",
    items: [
      { name: "Screen replacement service", quantity: 1, price: 100 },
      { name: "Replacement screen", quantity: 1, price: 45 },
    ],
  };
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Printer"
        description="Connect a Bluetooth ESC/POS printer and tune the image-based receipt output."
      />
      <div className="printer-layout">
        <section className="card">
          <div className="permission-row">
            <span className={`permission-icon ${available ? "good" : "bad"}`}>
              <Icon name={available ? "check" : "close"} />
            </span>
            <div>
              <h2>Bluetooth access</h2>
              <p>
                {available === null
                  ? "Checking this browser…"
                  : available
                    ? "Bluetooth is available in this browser."
                    : "Bluetooth is unavailable or permission is blocked."}
              </p>
            </div>
            <Button variant="secondary" onClick={() => checkBluetooth()}>
              Check permission
            </Button>
            <Badge tone={available === null ? "neutral" : available ? "success" : "danger"}>
              {available === null ? "Checking" : available ? "Available" : "Unavailable"}
            </Badge>
          </div>
          <div className="printer-action">
            <div>
              <h3>Find a printer</h3>
              <p>
                {nativeBridge
                  ? "Scanning opens the mobile app's native Bluetooth printer chooser. Select a compatible ESC/POS printer; it will then appear below for connection."
                  : "Scanning opens the browser's secure chooser. Select a compatible BLE ESC/POS printer; it will then appear below for connection."}
              </p>
            </div>
            <Button icon="search" onClick={scan} disabled={!available || busy}>
              {busy ? "Scanning…" : "Scan devices"}
            </Button>
          </div>
          <div className="device-list">
            {devices.length === 0 ? (
              <EmptyState
                icon="printer"
                title="No printers selected"
                message="Turn on a compatible BLE printer, keep it nearby, then scan."
              />
            ) : (
              devices.map((device) => (
                <button
                  className={connected === device.id ? "connected" : ""}
                  key={device.id}
                  onClick={() => connect(device)}
                >
                  <span className="stat-icon blue">
                    <Icon name="printer" />
                  </span>
                  <div>
                    <strong>{device.name}</strong>
                    <small>
                      {connected === device.id ? (
                        <StatusBadge status="CONNECTED_AND_READY" label="Connected and ready" />
                      ) : (
                        <StatusBadge status="TAP_TO_CONNECT" label="Tap to connect" />
                      )}
                    </small>
                  </div>
                  {connected === device.id ? (
                    <Badge tone="success">Connected</Badge>
                  ) : (
                    <Icon name="arrow" />
                  )}
                </button>
              ))
            )}
          </div>
          {message && <div className="notice">{message}</div>}
        </section>
        <aside className="card">
          <div className="card-head">
            <div>
              <h2>Invoice image</h2>
              <p>Printed as black and white pixels</p>
            </div>
          </div>
          <div className="image-flow">
            <span>Invoice</span>
            <Icon name="arrow" />
            <span>B&W image</span>
            <Icon name="arrow" />
            <span>ESC/POS</span>
          </div>
          <Field label="Paper width">
            <select
              value={paperWidthMm}
              onChange={(event) => changePaperWidth(Number(event.target.value))}
            >
              <option value={58}>57–58 mm (≈ 2¼ in) — small and mobile receipt printers</option>
              <option value={80}>80 mm (≈ 3⅛ in) — portable and desktop receipt printers</option>
              <option value={44}>38–44 mm (≈ 1½–1¾ in) — mini, label and tax-meter printers</option>
              <option value={110}>110 mm (≈ 4.3 in) — wide portable document printers</option>
              <option value={210}>210 mm (≈ 8.3 in) — mobile A4 document printers</option>
            </select>
          </Field>
          <Field label="Font size">
            <input
              type="range"
              min="10"
              max="24"
              step="1"
              value={fontSizePx}
              onChange={(event) => changeFontSize(Number(event.target.value))}
            />
            <div className="range-labels">
              <small>10 px</small>
              <strong>{fontSizePx} px</strong>
              <small>24 px</small>
            </div>
          </Field>
          <Form onSubmit={savePrinterSettings}>
            <label className="check-field">
              <input
                type="checkbox"
                checked={showLogo}
                onChange={(event) => setShowLogo(event.target.checked)}
              />
              <span>
                <strong>Show shop logo on printed invoices</strong>
                <small>Applies to sales and repair ticket invoices for this shop.</small>
              </span>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={showDeviceCompletionStatus}
                onChange={(event) => setShowDeviceCompletionStatus(event.target.checked)}
              />
              <span>
                <strong>Show device completion status</strong>
                <small>
                  Applies to each device on printed repair ticket invoices. Off by default.
                </small>
              </span>
            </label>
            <Field label="Footer note">
              <textarea
                rows={3}
                value={footerNote}
                onChange={(event) => setFooterNote(event.target.value)}
                placeholder="Thank you for shopping with us."
              />
            </Field>
            <Button
              type="submit"
              disabled={offline.status === "offline" && !offline.storageAvailable}
            >
              Save Setting
            </Button>
          </Form>
          <div className="notice">
            The complete invoice is rendered to a high-contrast monochrome image before
            transmission, preserving layout across compatible printer models.
          </div>
        </aside>
      </div>
      <section className="printer-previews">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>POS invoice preview</h2>
              <p>Checkout receipt design</p>
            </div>
          </div>
          <InvoiceReceipt invoice={posPreview} variant="pos" />
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Repair ticket invoice preview</h2>
              <p>Repair service receipt design</p>
            </div>
          </div>
          <InvoiceReceipt invoice={repairPreview} variant="repair" />
        </div>
      </section>
    </>
  );
}
