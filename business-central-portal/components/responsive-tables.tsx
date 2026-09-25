"use client";

import { useEffect, type RefObject } from "react";

const RESPONSIVE_TABLE_SELECTOR = ".data-table, .report-table";
const METRIC_HEADER_PATTERN =
  /amount|average|cogs|cost|count|discount|fee|margin|multiplier|order|price|profit|qty|quantity|revenue|sales|tax|total|transactions|value|variants|waiting/i;
const PRIMARY_HEADER_PATTERN =
  /activity|customer|invoice|item|member|method|name|product|service|ticket|variant/i;
const SECONDARY_IDENTITY_HEADER_PATTERN = /brand|category|code|from|reference|source/i;

function normalizedText(element: Element | undefined) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function tableHeaders(table: HTMLTableElement) {
  const headerRow = table.tHead?.rows.item(table.tHead.rows.length - 1);
  if (!headerRow) return [];

  return Array.from(headerRow.cells).flatMap((cell) => {
    const labelSource = cell.querySelector(".storage-column-label") ?? cell;
    const label = cell.dataset.mobileLabel || normalizedText(labelSource);
    return Array.from({ length: cell.colSpan }, () => label);
  });
}

function labelForCell(cell: HTMLTableCellElement, header: string | undefined) {
  const explicitLabel = cell.getAttribute("aria-label");
  if (explicitLabel) return explicitLabel;
  if (header) return header;
  if (cell.querySelector("button, a, input, select, textarea")) return "Actions";
  return "Details";
}

type MobileCellKind = "action" | "meta" | "metric" | "primary" | "status";

function isNumericValue(value: string) {
  if (!value || value === "—" || value === "-") return false;
  const withoutCurrencyCode = value.replace(/\b[A-Z]{3}\b/g, "").trim();
  if (!withoutCurrencyCode) return false;
  return /^[\s+\-−–$€£฿¥₫₹₩₭₦₱₲₴₵₺₼₽0-9.,()%×]+$/u.test(withoutCurrencyCode);
}

function isActionCell(cell: HTMLTableCellElement, label: string, index: number, count: number) {
  if (/actions?/i.test(label) || cell.querySelector(".row-actions")) return true;
  if (index !== count - 1 || cell.children.length === 0) return false;
  return Array.from(cell.children).every((child) => child.matches("a, button, .row-actions"));
}

function baseCellKind(
  cell: HTMLTableCellElement,
  label: string,
  index: number,
  count: number,
): MobileCellKind {
  if (isActionCell(cell, label, index, count)) return "action";
  if (/status/i.test(label) || cell.querySelector(".badge")) return "status";
  if (
    METRIC_HEADER_PATTERN.test(label) ||
    isNumericValue(normalizedText(cell)) ||
    cell.matches(".amount-positive, .amount-negative") ||
    cell.querySelector(".history-value-cell")
  )
    return "metric";
  return "meta";
}

function primaryScore(cell: HTMLTableCellElement, label: string, index: number) {
  let score = index === 0 ? 1 : 0;
  if (PRIMARY_HEADER_PATTERN.test(label)) score += 70;
  if (SECONDARY_IDENTITY_HEADER_PATTERN.test(label)) score += 25;
  if (cell.querySelector(".history-event-cell")) score += 100;
  if (cell.querySelector(".person-cell, .product-cell")) score += 90;
  if (cell.querySelector(".cell-main")) score += 70;
  if (cell.querySelector("strong, b")) score += 55;
  return score;
}

function annotateRow(row: HTMLTableRowElement, headers: string[]) {
  const cells = Array.from(row.cells);
  let columnIndex = 0;
  const cellData = cells.map((cell, index) => {
    const label = labelForCell(cell, headers[columnIndex]);
    columnIndex += cell.colSpan;
    return { cell, index, label, kind: baseCellKind(cell, label, index, cells.length) };
  });
  const primary = cellData
    .filter(({ kind }) => kind === "meta")
    .sort(
      (a, b) => primaryScore(b.cell, b.label, b.index) - primaryScore(a.cell, a.label, a.index),
    )[0];

  for (const item of cellData) {
    const kind: MobileCellKind = item === primary ? "primary" : item.kind;
    const text = normalizedText(item.cell);
    item.cell.dataset.mobileLabel = item.label;
    item.cell.dataset.mobileKind = kind;
    item.cell.dataset.mobileSpan =
      kind === "primary" ||
      kind === "action" ||
      text.length > 72 ||
      Boolean(item.cell.querySelector(".person-cell, .storage-catalog-paths"))
        ? "wide"
        : "normal";
    if (kind === "action") {
      item.cell.dataset.mobileActionLayout = text.length === 0 ? "compact" : "wide";
    } else {
      delete item.cell.dataset.mobileActionLayout;
    }
  }
}

export function annotateResponsiveTable(table: HTMLTableElement) {
  const headers = tableHeaders(table);
  const sections = [...Array.from(table.tBodies), table.tFoot].filter(
    (section): section is HTMLTableSectionElement => section !== null,
  );

  for (const section of sections) {
    for (const row of Array.from(section.rows)) {
      annotateRow(row, headers);
    }
  }

  table.classList.add("responsive-table-ready");
}

function annotateTables(root: HTMLElement) {
  for (const table of Array.from(
    root.querySelectorAll<HTMLTableElement>(RESPONSIVE_TABLE_SELECTOR),
  )) {
    annotateResponsiveTable(table);
  }
}

/**
 * Adds the visible mobile labels used when semantic table rows become list tiles.
 * The observer keeps labels correct for asynchronously loaded, filtered, and paginated rows.
 */
export function useResponsiveTables(rootRef: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    annotateTables(root);
    const observer = new MutationObserver(() => annotateTables(root));
    observer.observe(root, { childList: true, characterData: true, subtree: true });

    return () => observer.disconnect();
  }, [enabled, rootRef]);
}
