"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ProductManager } from "./product-manager";
import { StoragePage } from "./storage-page";
import { CustomersPage, DeliveriesPage } from "./customer-delivery-pages";
import { useTranslation } from "@/lib/i18n";

export function NanoProductsStoragePage() {
  const { isMerchant, can } = useAuth();
  return (
    <div className="nano-products-storage">
      {isMerchant && can("tenant.write") ? <ProductManager combinedStorage /> : <StoragePage />}
    </div>
  );
}

export function CustomerDeliveryWorkspace({ deliveries = false }: { deliveries?: boolean }) {
  const { can } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <>
      <nav className="nano-tabs" aria-label="Customers and deliveries">
        <Link
          href="/customers-and-deliveries"
          aria-current={pathname === "/customers-and-deliveries" ? "page" : undefined}
        >
          {t("nav.customers", "Customers")}
        </Link>
        {can("tenant.write") && (
          <Link
            href="/customers-and-deliveries/deliveries"
            aria-current={deliveries ? "page" : undefined}
          >
            {t("nav.deliveries", "Deliveries")}
          </Link>
        )}
      </nav>
      {deliveries ? <DeliveriesPage /> : <CustomersPage />}
    </>
  );
}
