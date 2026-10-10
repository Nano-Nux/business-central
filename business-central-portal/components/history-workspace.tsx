"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { MovementsPage } from "./operations-pages";
import { TransactionHistoryPage } from "./transaction-history-page";

export function HistoryWorkspace({
  transactions = false,
  standalone = false,
}: {
  transactions?: boolean;
  standalone?: boolean;
}) {
  const { merchant } = useAuth();
  const { t } = useTranslation();
  if (standalone && merchant?.pos_complexity_level !== "MINI") {
    return transactions ? <TransactionHistoryPage /> : <MovementsPage />;
  }
  return (
    <>
      <nav className="nano-tabs" aria-label="History">
        <Link href="/transaction-history" aria-current={transactions ? "page" : undefined}>
          {t("nav.transaction_history", "Transaction history")}
        </Link>
        <Link href="/stock-movements" aria-current={!transactions ? "page" : undefined}>
          {t("nav.stock_history", "Stock movement history")}
        </Link>
      </nav>
      {transactions ? <TransactionHistoryPage /> : <MovementsPage />}
    </>
  );
}
