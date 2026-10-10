"use client";

import Link from "next/link";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { formatShopDateTime } from "@/lib/date-time";
import { useAuth } from "@/lib/auth";
import { useShop } from "@/lib/shop";
import type { StockMovementDetail } from "@/lib/types";
import { useCachedQuery } from "@/lib/use-cached-query";
import { EmptyState, Loading, PageHeader, StatusBadge } from "./ui";

export { TransactionDetailPage } from "./transaction-detail-page";

export function MovementDetailPage({ id }: { id: string }) {
  const { isMerchant } = useAuth();
  const { currentShop } = useShop();
  const {
    data: detail,
    loading,
    error,
  } = useCachedQuery<StockMovementDetail>(
    `/inventory/movements/${id}`,
    `stock-movement-detail:${id}`,
  );

  if (!isMerchant) {
    return (
      <EmptyState
        title="Access restricted"
        message="Only merchant administrators can view stock movement cost allocations and ledger details."
      />
    );
  }

  if (loading) return <Loading />;
  if (error || !detail)
    return (
      <EmptyState
        title="Stock movement not found"
        message={error || "This movement is not available in the current shop."}
      />
    );

  const item = detail.movement;
  const currency = detail.receipt?.currency_code || detail.order?.currency_code;
  const money = (value: string | undefined) => formatMoney(value, currency);
  const unit = detail.unit_symbol || detail.unit_name || "base unit";
  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title={`${detail.product_name} · ${detail.variant_name}`}
        description="Complete immutable stock ledger event and its related business documents."
        action={
          <Link className="button button-secondary" href="/stock-history">
            Back to movements
          </Link>
        }
      />
      <section className="transaction-financial-grid">
        <div className="card">
          <span>Movement</span>
          <strong>{item.movement_type}</strong>
        </div>
        <div className="card">
          <span>Quantity</span>
          <strong>
            {formatQuantity(item.quantity)} {unit}
          </strong>
        </div>
        <div className="card">
          <span>Unit cost</span>
          <strong>
            {item.unit_cost
              ? money(item.unit_cost)
              : detail.cost_allocations.length === 1
                ? money(detail.cost_allocations[0].unit_cost)
                : "Multiple FIFO costs"}
          </strong>
        </div>
        <div className="card">
          <span>Total cost</span>
          <strong>{money(detail.total_cost)}</strong>
        </div>
      </section>
      <section className="card detail-card">
        <h2>Movement details</h2>
        <dl>
          <div>
            <dt>Product</dt>
            <dd>{detail.product_name}</dd>
          </div>
          <div>
            <dt>Variant</dt>
            <dd>{detail.variant_name}</dd>
          </div>
          <div>
            <dt>SKU</dt>
            <dd>{detail.sku}</dd>
          </div>
          <div>
            <dt>Barcode</dt>
            <dd>{detail.barcode || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Entered quantity</dt>
            <dd>
              {formatQuantity(item.entered_quantity || item.quantity)} {unit}
            </dd>
          </div>
          <div>
            <dt>Base quantity</dt>
            <dd>{formatQuantity(item.quantity)}</dd>
          </div>
          <div>
            <dt>Source location</dt>
            <dd>
              {detail.source_location_name
                ? `${detail.source_location_name} (${detail.source_location_code})`
                : "Not applicable"}
            </dd>
          </div>
          <div>
            <dt>Destination location</dt>
            <dd>
              {detail.destination_location_name
                ? `${detail.destination_location_name} (${detail.destination_location_code})`
                : "Not applicable"}
            </dd>
          </div>
          <div>
            <dt>Occurred</dt>
            <dd>{formatShopDateTime(item.occurred_at, currentShop?.timezone)}</dd>
          </div>
          <div>
            <dt>Event key</dt>
            <dd>
              <code>{item.event_key}</code>
            </dd>
          </div>
          <div>
            <dt>Movement ID</dt>
            <dd>
              <code>{item.id}</code>
            </dd>
          </div>
          {item.reverses_movement_id && (
            <div>
              <dt>Reverses movement</dt>
              <dd>
                <Link className="text-link" href={`/stock-history/${item.reverses_movement_id}`}>
                  View original movement
                </Link>
              </dd>
            </div>
          )}
        </dl>
        {detail.product_description && <p className="notice">{detail.product_description}</p>}
      </section>

      {(detail.source_location_name || detail.destination_location_name) && (
        <section className="card detail-card">
          <h2>Current stock balance</h2>
          <dl>
            {detail.source_location_name && (
              <>
                <div>
                  <dt>{detail.source_location_name} on hand</dt>
                  <dd>{formatQuantity(detail.source_quantity_on_hand)}</dd>
                </div>
                <div>
                  <dt>{detail.source_location_name} reserved</dt>
                  <dd>{formatQuantity(detail.source_quantity_reserved)}</dd>
                </div>
              </>
            )}
            {detail.destination_location_name && (
              <>
                <div>
                  <dt>{detail.destination_location_name} on hand</dt>
                  <dd>{formatQuantity(detail.destination_quantity_on_hand)}</dd>
                </div>
                <div>
                  <dt>{detail.destination_location_name} reserved</dt>
                  <dd>{formatQuantity(detail.destination_quantity_reserved)}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="notice">
            These balances are current; the movement quantity above is the immutable historical
            value.
          </p>
        </section>
      )}

      {detail.receipt && (
        <section className="card detail-card">
          <h2>Stock receipt and purchase order</h2>
          <dl>
            <div>
              <dt>Receipt number</dt>
              <dd>{detail.receipt.receipt_number}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatShopDateTime(detail.receipt.received_at, currentShop?.timezone)}</dd>
            </div>
            <div>
              <dt>Purchase order</dt>
              <dd>{detail.receipt.purchase_order_number}</dd>
            </div>
            <div>
              <dt>PO status</dt>
              <dd>
                <StatusBadge status={detail.receipt.purchase_order_status} />
              </dd>
            </div>
            <div>
              <dt>Supplier</dt>
              <dd>{detail.receipt.supplier_name}</dd>
            </div>
            <div>
              <dt>Received quantity</dt>
              <dd>{formatQuantity(detail.receipt.quantity_received)}</dd>
            </div>
            <div>
              <dt>Original unit cost</dt>
              <dd>{money(detail.receipt.unit_cost)}</dd>
            </div>
            <div>
              <dt>Batch</dt>
              <dd>{detail.receipt.batch_number || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Expiry</dt>
              <dd>
                {detail.receipt.expires_at
                  ? new Date(detail.receipt.expires_at).toLocaleDateString()
                  : "Not recorded"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {detail.order && (
        <section className="card detail-card">
          <h2>Related checkout order</h2>
          <dl>
            <div>
              <dt>Order</dt>
              <dd>
                {detail.order.order_number}{" "}
                <Link className="text-link" href={`/transaction-history/${detail.order.order_id}`}>
                  View complete order
                </Link>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={detail.order.status} />
              </dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>{detail.order.channel}</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>{detail.order.customer_name ?? ""}</dd>
            </div>
            <div>
              <dt>Order-line quantity</dt>
              <dd>{formatQuantity(detail.order.ordered_quantity)}</dd>
            </div>
            <div>
              <dt>Sell price</dt>
              <dd>{money(detail.order.unit_price)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>{money(detail.order.discount_amount)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{money(detail.order.tax_amount)}</dd>
            </div>
            <div>
              <dt>Line total</dt>
              <dd>{money(detail.order.line_total)}</dd>
            </div>
          </dl>
        </section>
      )}

      {(detail.cost_allocations?.length ?? 0) > 0 && (
        <section>
          <h2 className="section-title">FIFO cost allocations</h2>
          <div className="table-card transaction-detail-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source receipt</th>
                  <th>Quantity used</th>
                  <th>Unit cost</th>
                  <th>Total cost</th>
                  <th>Layer received</th>
                  <th>Layer remaining now</th>
                </tr>
              </thead>
              <tbody>
                {detail.cost_allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td>{allocation.source_receipt_number || "Direct stock layer"}</td>
                    <td>{formatQuantity(allocation.quantity)}</td>
                    <td>{money(allocation.unit_cost)}</td>
                    <td>
                      <strong>{money(allocation.total_cost)}</strong>
                    </td>
                    <td>{formatQuantity(allocation.layer_quantity_received)}</td>
                    <td>{formatQuantity(allocation.layer_quantity_remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
