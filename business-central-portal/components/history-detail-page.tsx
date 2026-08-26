"use client";

import Link from "next/link";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { formatShopDateTime } from "@/lib/date-time";
import { useShop } from "@/lib/shop";
import type { StockMovementDetail, TransactionHistoryDetail } from "@/lib/types";
import { useCachedQuery } from "@/lib/use-cached-query";
import { EmptyState, Loading, PageHeader, StatusBadge } from "./ui";

export function TransactionDetailPage({ id }: { id: string }) {
  const { currentShop } = useShop();
  const {
    data: detail,
    loading,
    error,
  } = useCachedQuery<TransactionHistoryDetail>(
    `/transaction-history/${id}`,
    `transaction-history-detail:${id}`,
  );

  if (loading) return <Loading />;
  if (error || !detail)
    return (
      <EmptyState
        title="Transaction not found"
        message={error || "This transaction is not available in the current shop."}
      />
    );

  const { entry, order } = detail;
  const currency = order?.currency_code || entry.currency_code;
  const money = (value: string | undefined) => formatMoney(value, currency);
  const hasPendingInventoryCost = detail.lines.some((line) => line.cost_posted === false);
  const pendingCost = (
    <span title="FIFO inventory cost is posted when the order is fulfilled.">
      <StatusBadge status="PENDING" label="Pending fulfillment" />
    </span>
  );

  return (
    <>
      <PageHeader
        eyebrow="Transaction history"
        title={entry.reference}
        description="Complete checkout order, pricing, cost, profit, payment, and refund details."
        action={
          <Link className="button button-secondary" href="/transaction-history">
            Back to history
          </Link>
        }
      />
      <section className="card detail-card">
        <dl>
          <div>
            <dt>Activity</dt>
            <dd>{entry.event_type}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={order?.status || entry.status} />
            </dd>
          </div>
          <div>
            <dt>Order date</dt>
            <dd>
              {formatShopDateTime(
                order?.placed_at || order?.created_at || entry.occurred_at,
                currentShop?.timezone,
              )}
            </dd>
          </div>
          <div>
            <dt>Channel</dt>
            <dd>{order?.channel || entry.channel || "—"}</dd>
          </div>
          <div>
            <dt>Customer</dt>
            <dd>{order?.customer_name || entry.customer_name || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Customer phone</dt>
            <dd>{order?.customer_phone || entry.customer_phone || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Shop</dt>
            <dd>{order?.shop_name || entry.shop_name || "—"}</dd>
          </div>
          <div>
            <dt>Payment type</dt>
            <dd>{order?.payment_type || entry.payment_method || "—"}</dd>
          </div>
          {order?.delivery_name && (
            <div>
              <dt>Delivery</dt>
              <dd>
                {order.delivery_name}
                {order.delivery_contact ? ` · ${order.delivery_contact}` : ""}
              </dd>
            </div>
          )}
          {order?.note && (
            <div>
              <dt>Order note</dt>
              <dd>{order.note}</dd>
            </div>
          )}
        </dl>
      </section>

      {order ? (
        <>
          <section className="transaction-financial-grid">
            <div className="card">
              <span>Checkout total</span>
              <strong>{money(order.grand_total)}</strong>
            </div>
            <div className="card">
              <span>Original cost</span>
              <strong>{hasPendingInventoryCost ? pendingCost : money(detail.total_cost)}</strong>
            </div>
            <div className="card">
              <span>Gross profit</span>
              <strong>{hasPendingInventoryCost ? "Not final" : money(detail.gross_profit)}</strong>
            </div>
            <div className="card">
              <span>Gross margin</span>
              <strong>
                {hasPendingInventoryCost
                  ? "Not final"
                  : `${Number(detail.gross_margin).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}
              </strong>
            </div>
          </section>
          {hasPendingInventoryCost && (
            <p className="notice">
              Inventory cost and profit are not final yet. FIFO cost is posted when this checkout is
              fulfilled; the product has not been deducted from stock while the order remains
              pending.
            </p>
          )}

          <section>
            <h2 className="section-title">Order items</h2>
            <div className="table-card transaction-detail-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Sell price</th>
                    <th>Original unit cost</th>
                    <th>Original cost</th>
                    <th>Discount</th>
                    <th>Tax</th>
                    <th>Line total</th>
                    <th>Profit</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <div className="cell-main">
                          <strong>{line.product_name || line.description}</strong>
                          <small>
                            {[line.variant_name, line.sku].filter(Boolean).join(" · ") ||
                              line.description}
                          </small>
                        </div>
                      </td>
                      <td>{formatQuantity(line.quantity)}</td>
                      <td>{money(line.unit_price)}</td>
                      <td>
                        {line.cost_posted === false ? pendingCost : money(line.original_unit_cost)}
                      </td>
                      <td>
                        {line.cost_posted === false ? pendingCost : money(line.original_cost)}
                      </td>
                      <td>{money(line.discount_amount)}</td>
                      <td>{money(line.tax_amount)}</td>
                      <td>
                        <strong>{money(line.line_total)}</strong>
                      </td>
                      <td className={line.cost_posted === false ? undefined : "amount-positive"}>
                        {line.cost_posted === false ? "Not final" : money(line.gross_profit)}
                      </td>
                      <td>
                        {line.cost_posted === false
                          ? "Not final"
                          : `${Number(line.gross_margin).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="transaction-detail-columns">
            <div className="card detail-card">
              <h2>Order totals</h2>
              <dl>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(order.subtotal)}</dd>
                </div>
                <div>
                  <dt>Discount</dt>
                  <dd>{money(order.discount_total)}</dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>{money(order.tax_total)}</dd>
                </div>
                <div>
                  <dt>Shipping</dt>
                  <dd>{money(order.shipping_total)}</dd>
                </div>
                <div>
                  <dt>Grand total</dt>
                  <dd>{money(order.grand_total)}</dd>
                </div>
              </dl>
            </div>
            <div className="card detail-card">
              <h2>Payments</h2>
              {detail.payments.length ? (
                <dl>
                  {detail.payments.map((payment) => (
                    <div key={payment.id}>
                      <dt>
                        {payment.method} · <StatusBadge status={payment.status} />
                      </dt>
                      <dd>
                        {money(payment.amount)}
                        <small>
                          {formatShopDateTime(
                            payment.captured_at || payment.created_at,
                            currentShop?.timezone,
                          )}
                        </small>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="notice">No payment was recorded.</p>
              )}
            </div>
          </section>
          {detail.refunds.length > 0 && (
            <section className="card detail-card">
              <h2>Refunds</h2>
              <dl>
                {detail.refunds.map((refund) => (
                  <div key={refund.id}>
                    <dt>
                      <StatusBadge status={refund.status} /> ·{" "}
                      {formatShopDateTime(refund.created_at, currentShop?.timezone)}
                    </dt>
                    <dd>
                      {money(refund.amount)}
                      <small>{refund.reason || "No reason recorded"}</small>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </>
      ) : (
        <section className="card">
          <p className="notice">
            {entry.details || "This stock event is not linked to a checkout order."}
          </p>
        </section>
      )}
    </>
  );
}

export function MovementDetailPage({ id }: { id: string }) {
  const { currentShop } = useShop();
  const {
    data: detail,
    loading,
    error,
  } = useCachedQuery<StockMovementDetail>(
    `/inventory/movements/${id}`,
    `stock-movement-detail:${id}`,
  );
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
          <Link className="button button-secondary" href="/stock-movements">
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
                <Link className="text-link" href={`/stock-movements/${item.reverses_movement_id}`}>
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
              <dd>{detail.order.customer_name || "Not recorded"}</dd>
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

      {detail.cost_allocations.length > 0 && (
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
