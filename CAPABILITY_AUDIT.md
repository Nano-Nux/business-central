# Complete Capability Audit

Historical post-P1 comparison of `old-schema.sql` and the pre-P2 `schema.sql`. The deferred capabilities identified here were subsequently implemented in [P2_IMPLEMENTATION_REPORT.md](P2_IMPLEMENTATION_REPORT.md). Remaining optional deferred scope is centralized in [PHASE7_DEFERRED_PLAN.md](PHASE7_DEFERRED_PLAN.md); use that document for the current backlog.

## Capability matrix

| Capability | Old Schema | New Schema | Status |
|---|---|---|---|
| Organizations | organizations, business_units, merchants | merchants | Partially Missing |
| Merchants | merchants | merchants | Preserved |
| Shops | shops | shops | Preserved |
| Users | user_identities, users, refresh_tokens | user_identities, user_memberships | Replaced |
| RBAC | roles, permissions, user_roles, manager_shop_assignments | roles, permissions, membership_roles, membership_shop_assignments | Partially Missing |
| Customers | customers, shop_customers, ecommerce_customer_accounts, customer_addresses | customers, customer_addresses | Consolidated |
| Products | products, brands, categories, images, attributes | products plus catalog_* extensions | Replaced |
| Variants | product_variants | product_variants | Preserved |
| Pricing | product_prices, price types, tax_rates | product_prices, price_lists, promotions | Partially Missing |
| Inventory | inventory_items, warehouse_inventory, movements, reservations, FIFO/batches | balances, movements, reservations, FIFO layers, batches | Replaced |
| Warehouses | warehouses, warehouse_locations | locations | Consolidated |
| Batches | inventory_batches | inventory_batches plus movement links | Replaced |
| Serials | inventory_serials | inventory_serials plus movement links | Replaced |
| Assets | inventory_assets, identifiers, barcode registry | inventory_assets | Partially Missing |
| Purchasing | purchase orders, items, receipts, supplier invoices/returns | purchase orders, lines, receipts | Partially Missing |
| Suppliers | suppliers | suppliers | Preserved |
| Goods Receipts | goods_receipts, goods_receipt_items | goods_receipts, goods_receipt_lines | Replaced |
| Sales/POS | sales, sale_items, POS terminals/sessions/transactions | orders, order_lines, POS terminals/sessions | Partially Missing |
| Payments | payments, proofs, provider sessions, settings | payments, refunds | Partially Missing |
| Ecommerce | stores, carts, checkout, ecommerce orders, shipments, shipping, events | carts, checkout, orders, fulfillments | Partially Missing |
| Promotions | promotions, promotion_products, codes, redemptions, discounts | promotions, codes, order_promotions, redemptions | Partially Missing |
| Returns | ecommerce_returns, return_items, ecommerce_refunds | ecommerce_returns, ecommerce_return_lines, refunds | Replaced |
| Accounting | accounts, journals, periods, ledger, tax, cash/bank | accounting accounts/events, journals | Partially Missing |
| AR/AP | AR documents/allocations, supplier invoices/payments, AP allocations | None | Missing |
| CRM | customers, notes, activities, tags, conversations, messages | customers only | Partially Missing |
| Notifications | notifications | None | Missing |
| Audit Logs | audit_logs | audit_events | Replaced |
| Workflows | workflows, rules, executions, logs | None | Missing |
| AI Features | ai_providers, ai_sessions, ai_requests | None | Missing |
| Offline Sync | sync_* tables and sequence | None | Missing |
| Files | file_objects, product images, payment proofs | catalog image URLs only | Missing |
| Reporting | shop_settings_view and reporting indexes | No views/report tables | Partially Missing |


## Missing and partially missing capability analysis

| Capability | Exactly removed | Intentional? | Business impact | Restore? |
|---|---|---|---|---|
| Organizations | Organization hierarchy and business_units; merchants is sole tenant boundary. | Intentional for commerce core, not equivalent for holding/group/division accounting. | Cross-business-unit ownership and reporting are unavailable. | Optional enterprise extension only. |
| RBAC | Old organization/global scope and manager assignment semantics; new shop assignment is narrower. | Partly intentional simplification. | Tenant roles work, but full scope-aware authorization is not represented. | Add scope only if required. |
| Pricing | Multiple old price columns/price types, overlap exclusion semantics, tax_rates. | Price lists were redesigned; tax setup was deferred. | Tax and some historical price-book workflows cannot be authoritative. | Add tax/rule extensions, not old columns. |
| Assets | Asset identifiers, identifier types, barcode_registry, richer ownership rules. | Partly intentional redesign. | Barcode and full asset traceability workflows are incomplete. | Restore identifier/barcode extensions if needed. |
| Purchasing | Supplier invoices, invoice lines, supplier payments/returns, AP allocations. | Core purchasing was retained; subledger was deferred. | Supplier liabilities, invoice matching, and supplier returns are unavailable. | Add accounting subledger extension. |
| Sales/POS | Separate sales/sale_items and pos_transactions; cash transaction history and some sale/payment invariants. | Duplicate sale aggregate removal was intentional; cash ledger was not fully replaced. | POS has sessions but not complete cash reconciliation. | Keep orders canonical; add cash/tender extension if required. |
| Payments | Payment proofs, provider sessions/configuration/settings, payment-total validators. | Payment ownership was consolidated; provider workflows deferred. | Manual proof review and strict provider/order reconciliation are absent. | Add provider/proof extension and invariant trigger. |
| Ecommerce | Store-specific tables, ecommerce order aggregate, shipping methods, order events, allocations, discounts. | Duplicate orders/customers/fulfillments were intentionally consolidated; channel features were deferred. | Checkout core exists, but storefront/shipping/event workflows are incomplete. | Add focused extensions; do not restore duplicate orders. |
| Promotions | Product applicability and richer old rule types. | Storage was redesigned, but these rules were not restored. | Cannot express all old product-scoped/BOGO behavior. | Extend the new promotion model. |
| Accounting | Periods, tax, ledger balances, invoices, expenses, cash, bank, AR/AP. | Journal/event core was intentionally simplified; subledgers deferred. | Full business-central accounting cannot run. | Redesign around accounting_events and journals. |
| AR/AP | AR docs/allocations, supplier invoices/payments, AP allocations. | Not represented in commerce core. | Receivables/payables lifecycle and aging are unavailable. | Separate accounting extension. |
| CRM | Notes, activities, tags, conversations, messages, email channels/templates/queue. | Customer master consolidation was intentional; interaction history deferred. | Customer service history and communication persistence are absent. | Add CRM extension keyed to customers/orders. |
| Notifications | notifications table and recipient indexes. | Deferred, not consolidated. | No durable notification/read-state model. | Restore small merchant-scoped extension if needed. |
| Workflows | workflows, rules, executions, logs. | Deferred, not consolidated. | No durable automation state or execution audit. | Optional automation extension. |
| AI Features | ai_providers, ai_sessions, ai_requests. | Deferred, not consolidated. | No AI request/provider persistence. | Optional integration extension. |
| Offline Sync | All sync tables and sync_server_sequence_seq. | Deferred, not consolidated. | Offline versioning, conflicts, and checkpoints unavailable. | Restore only if offline is a requirement. |
| Files | file_objects and payment-proof storage metadata; images are URLs only. | Storage integration deferred. | No durable file ownership/upload/review model. | Add generic file-object extension. |
| Reporting | shop_settings_view and domain reporting indexes/views. | Core favors canonical query models, but old reports are not compatible. | Existing old reports must be rebuilt. | Build canonical reports/materialized views. |


## Missing tables

164 old table names are absent by exact name. This includes intentional consolidations and true omissions.

`accounting_periods`, `accounts`, `accounts_payable_allocations`, `accounts_receivable_allocations`, `accounts_receivable_documents`, `ai_providers`, `ai_requests`, `ai_sessions`, `attribute_definition_options`, `attribute_definitions`, `audit_logs`, `bank_accounts`, `bank_reconciliation_items`, `bank_reconciliations`, `bank_transactions`, `banner_image_list`, `barcode_registry`, `brands`, `business_units`, `cash_accounts`, `cash_transactions`, `categories`, `clinical_diagnoses`, `clinical_encounters`, `clinical_measurements`, `clinical_notes`, `clinical_procedures`, `communication_channels`, `conversation_participants`, `conversations`, `custom_field_definitions`, `custom_field_values`, `customer_activities`, `customer_notes`, `customer_supplied_parts`, `customer_tag_map`, `customer_tags`, `document_sequences`, `ecommerce_customer_accounts`, `ecommerce_customer_addresses`, `ecommerce_order_discounts`, `ecommerce_order_events`, `ecommerce_order_item_allocations`, `ecommerce_order_items`, `ecommerce_orders`, `ecommerce_promotion_codes`, `ecommerce_promotion_redemptions`, `ecommerce_refunds`, `ecommerce_return_items`, `ecommerce_shipment_items`, `ecommerce_shipments`, `ecommerce_shipping_methods`, `ecommerce_store_fulfillment_locations`, `ecommerce_store_product_variants`, `ecommerce_store_products`, `ecommerce_stores`, `email_queue`, `email_templates`, `expense_items`, `expenses`, `external_id_map`, `file_objects`, `goods_receipt_items`, `guest_order_access_tokens`, `guest_order_verifications`, `idempotency_keys`, `integration_connections`, `inventory_asset_identifiers`, `inventory_identifier_types`, `inventory_items`, `inventory_operations`, `inventory_reconciliation_exceptions`, `inventory_transformation_lines`, `inventory_transformations`, `invoices`, `ledger_balances`, `manager_shop_assignments`, `measurement_groups`, `merchant_modules`, `merchant_payment_configurations`, `messages`, `migration_audit`, `modules`, `notifications`, `order_items`, `organizations`, `outbox_events`, `patient_allergies`, `patient_consents`, `patient_contacts`, `patient_identifiers`, `patients`, `payment_proofs`, `payment_provider_sessions`, `payment_settings`, `pos_transactions`, `prescription_items`, `prescriptions`, `product_attribute_assignments`, `product_attributes`, `product_categories`, `product_images`, `promotion_products`, `purchase_order_items`, `refresh_tokens`, `repair_approvals`, `repair_device_identifiers`, `repair_devices`, `repair_diagnostics`, `repair_order_parts`, `repair_orders`, `repair_warranties`, `salary_payments`, `sale_items`, `sales`, `service_appointments`, `service_catalog`, `service_categories`, `service_order_assignments`, `service_order_attachments`, `service_order_billings`, `service_order_items`, `service_order_notes`, `service_order_status_history`, `service_orders`, `service_prices`, `shop_customers`, `staff_contracts`, `stock_item_configurations`, `stock_item_identifier_rules`, `stock_item_unit_conversions`, `stock_item_units`, `stock_items`, `supplier_invoice_items`, `supplier_invoices`, `supplier_payments`, `supplier_return_items`, `supplier_returns`, `support_messages`, `support_tickets`, `sync_changes`, `sync_checkpoints`, `sync_conflicts`, `sync_devices`, `sync_entity_versions`, `sync_logs`, `sync_operations`, `sync_sessions`, `system_settings`, `tax_rates`, `testimonials`, `treatment_plan_items`, `treatment_plans`, `unit_definitions`, `user_roles`, `users`, `warehouse_inventory`, `warehouse_inventory_movements`, `warehouse_locations`, `warehouses`, `workflow_executions`, `workflow_logs`, `workflow_rules`, `workflows`

## Missing functions

34 old function names are absent by exact name.

- `app_is_platform_owner` — Replaced by `app_is_platform_admin`
- `apply_warehouse_inventory_movement` — Replaced by `apply_inventory_movement`
- `enforce_balanced_journal_entry` — Replaced by `validate_journal_balance`
- `guard_ecommerce_order_item_fulfillment_update` — No functional counterpart
- `guard_warehouse_inventory_balance_update` — No functional counterpart
- `prevent_posted_journal_mutation` — No functional counterpart
- `prevent_signed_clinical_note_mutation` — No functional counterpart
- `recalculate_ecommerce_order_item_fulfillment` — No functional counterpart
- `recalculate_ecommerce_shipment_fulfillment` — No functional counterpart
- `validate_clinical_encounter_scope` — No functional counterpart
- `validate_clinical_note_version` — No functional counterpart
- `validate_clinical_procedure_scope` — No functional counterpart
- `validate_ecommerce_cart_scope` — Replaced by `validate_ecommerce_cart_item`
- `validate_ecommerce_checkout_scope` — Replaced by `validate_ecommerce_checkout`
- `validate_ecommerce_order_item_allocation` — No functional counterpart
- `validate_ecommerce_order_scope` — No functional counterpart
- `validate_ecommerce_order_transition` — No functional counterpart
- `validate_ecommerce_promotion_redemption` — Replaced by `redeem_promotion`
- `validate_ecommerce_refund_scope` — No functional counterpart
- `validate_ecommerce_return_item_scope` — Replaced by `validate_return_line`
- `validate_ecommerce_shipment_item_scope` — No functional counterpart
- `validate_ecommerce_shipment_scope` — No functional counterpart
- `validate_ecommerce_store_fulfillment_location` — No functional counterpart
- `validate_inventory_transformation_line_scope` — No functional counterpart
- `validate_journal_entry_balance` — No functional counterpart
- `validate_manager_shop_assignment` — Replaced by `validate_membership_shop_assignment`
- `validate_payment_scope` — No functional counterpart
- `validate_repair_order_scope` — No functional counterpart
- `validate_repair_part_scope` — No functional counterpart
- `validate_sale_item_inventory_scope` — No functional counterpart
- `validate_sale_payment_totals` — No functional counterpart
- `validate_sale_payment_totals_for_sale` — No functional counterpart
- `validate_service_order_item_inventory_scope` — No functional counterpart
- `validate_user_role` — No functional counterpart

## Missing triggers

37 old trigger names are absent by exact name:

`trg_clinical_encounters_scope`, `trg_clinical_notes_immutable`, `trg_clinical_notes_version`, `trg_clinical_procedures_scope`, `trg_ecommerce_cart_scope_validate`, `trg_ecommerce_checkout_scope_validate`, `trg_ecommerce_order_item_allocation_validate`, `trg_ecommerce_order_item_fulfillment_guard`, `trg_ecommerce_order_scope_validate`, `trg_ecommerce_order_transition_validate`, `trg_ecommerce_promotion_redemption_validate`, `trg_ecommerce_refund_validate`, `trg_ecommerce_return_item_validate`, `trg_ecommerce_shipment_item_fulfillment_apply`, `trg_ecommerce_shipment_item_validate`, `trg_ecommerce_shipment_scope_validate`, `trg_ecommerce_shipment_status_fulfillment_apply`, `trg_ecommerce_store_fulfillment_location_validate`, `trg_inventory_items_balance_guard`, `trg_inventory_movements_apply`, `trg_inventory_reservations_apply`, `trg_inventory_transformation_lines_scope`, `trg_journal_entries_balanced`, `trg_journal_entries_immutable`, `trg_journal_lines_balanced`, `trg_journal_lines_immutable`, `trg_manager_shop_assignments_validate`, `trg_payments_scope_validate`, `trg_payments_totals_validate`, `trg_repair_order_parts_scope`, `trg_repair_orders_scope`, `trg_sale_items_inventory_scope`, `trg_sales_totals_validate`, `trg_service_order_items_inventory_scope`, `trg_user_roles_validate`, `trg_warehouse_inventory_balance_guard`, `trg_warehouse_inventory_movements_apply`

## Missing indexes

251 old index names are absent by exact name, grouped by old table:

- `accounting_periods`: `idx_accounting_periods_merchant_dates`
- `accounts_payable_allocations`: `idx_ap_allocations_invoice`
- `accounts_receivable_allocations`: `idx_ar_allocations_document`
- `accounts_receivable_documents`: `idx_ar_documents_merchant_status_due`
- `ai_requests`: `idx_ai_requests_merchant_status`
- `ai_sessions`: `idx_ai_sessions_merchant`
- `attribute_definition_options`: `idx_attribute_options_definition`
- `attribute_definitions`: `idx_attribute_definitions_merchant`
- `audit_logs`: `idx_audit_entity`, `idx_audit_logs_merchant_created`, `idx_audit_logs_organization_created`
- `bank_accounts`: `idx_bank_accounts_merchant`
- `bank_reconciliation_items`: `idx_bank_reconciliation_items_reconciliation`
- `bank_reconciliations`: `idx_bank_reconciliations_account_status`
- `bank_transactions`: `idx_bank_transactions_account_date`
- `banner_image_list`: `idx_banner_image_list_shop_active`
- `barcode_registry`: `idx_barcode_lookup`, `idx_barcode_one_primary_asset`, `idx_barcode_one_primary_batch`, `idx_barcode_one_primary_product`, `idx_barcode_one_primary_stock`, `idx_barcode_one_primary_unit`, `idx_barcode_one_primary_variant`
- `business_units`: `idx_business_units_organization_parent`
- `cash_accounts`: `idx_cash_accounts_shop`
- `cash_transactions`: `idx_cash_transactions_account_date`
- `categories`: `idx_categories_path`, `idx_categories_tree`
- `clinical_diagnoses`: `idx_clinical_diagnoses_encounter`
- `clinical_encounters`: `idx_clinical_encounters_patient`, `idx_clinical_encounters_practitioner`, `idx_clinical_encounters_shop_date`
- `clinical_measurements`: `idx_clinical_measurements_encounter`
- `clinical_notes`: `idx_clinical_notes_encounter`, `idx_clinical_notes_one_successor`, `idx_clinical_notes_versions`
- `clinical_procedures`: `idx_clinical_procedures_encounter`
- `communication_channels`: `idx_communication_channels_type`
- `conversation_participants`: `idx_conversation_participants_conversation`
- `conversations`: `idx_conversations_customer_status`, `idx_conversations_external`
- `custom_field_definitions`: `idx_custom_field_definitions_entity`
- `custom_field_values`: `idx_custom_field_values_entity`
- `customer_activities`: `idx_customer_activities_customer`
- `customer_addresses`: `idx_customer_addresses_customer`, `idx_customer_addresses_default`, `idx_customer_addresses_default_billing`, `idx_customer_addresses_default_shipping`
- `customer_notes`: `idx_customer_notes_customer`
- `customer_supplied_parts`: `idx_customer_supplied_parts_customer`
- `customer_tag_map`: `idx_customer_tag_map_tag`
- `customer_tags`: `idx_customer_tags_merchant`
- `customers`: `idx_customers_lookup`
- `document_sequences`: `idx_document_sequences_type_scope`
- `ecommerce_cart_items`: `idx_ecommerce_cart_items_unique_product_variant`
- `ecommerce_carts`: `idx_ecommerce_carts_one_active_customer`, `idx_ecommerce_carts_store_status`
- `ecommerce_checkout_sessions`: `idx_ecommerce_checkout_sessions_idempotency`, `idx_ecommerce_checkout_sessions_store_status`
- `ecommerce_customer_accounts`: `idx_ecommerce_customer_accounts_email_lower`
- `ecommerce_customer_addresses`: `idx_ecommerce_customer_addresses_account`, `idx_ecommerce_customer_addresses_one_default`
- `ecommerce_order_discounts`: `idx_ecommerce_order_discounts_order`
- `ecommerce_order_events`: `idx_ecommerce_order_events_order`
- `ecommerce_order_item_allocations`: `idx_ecommerce_order_item_allocations_inventory`, `idx_ecommerce_order_item_allocations_item`
- `ecommerce_order_items`: `idx_ecommerce_order_items_order`
- `ecommerce_orders`: `idx_ecommerce_orders_customer`, `idx_ecommerce_orders_external_number`, `idx_ecommerce_orders_store_status`
- `ecommerce_promotion_codes`: `idx_ecommerce_promotion_codes_lower`
- `ecommerce_promotion_redemptions`: `idx_ecommerce_promotion_redemptions_code`
- `ecommerce_refunds`: `idx_ecommerce_refunds_order_status`
- `ecommerce_return_items`: `idx_ecommerce_return_items_order_item`
- `ecommerce_shipment_items`: `idx_ecommerce_shipment_items_shipment`
- `ecommerce_shipments`: `idx_ecommerce_shipments_order_status`, `idx_ecommerce_shipments_tracking`
- `ecommerce_shipping_methods`: `idx_ecommerce_shipping_methods_store`
- `ecommerce_store_fulfillment_locations`: `idx_ecommerce_store_fulfillment_locations`
- `ecommerce_store_product_variants`: `idx_ecommerce_store_product_variants`
- `ecommerce_store_products`: `idx_ecommerce_store_products_store_published`
- `ecommerce_stores`: `idx_ecommerce_stores_domain_lower`, `idx_ecommerce_stores_merchant_active`, `idx_ecommerce_stores_slug_lower`
- `email_queue`: `idx_email_queue_dispatch`, `idx_email_queue_template`
- `expense_items`: `idx_expense_items_expense`
- `expenses`: `idx_expenses_business_unit_date`, `idx_expenses_merchant_date`
- `file_objects`: `idx_file_objects_merchant_created`, `idx_file_objects_merchant_id`
- `goods_receipt_items`: `idx_goods_receipt_items_merchant_receipt`
- `goods_receipts`: `idx_goods_receipts_purchase_order`
- `guest_order_access_tokens`: `idx_guest_order_access_tokens_email`, `idx_guest_order_access_tokens_expiry`
- `guest_order_verifications`: `idx_guest_order_verifications_email`, `idx_guest_order_verifications_expiry`
- `idempotency_keys`: `idx_idempotency_keys_expiry`, `idx_idempotency_keys_scope`
- `integration_connections`: `idx_integration_connections_scope`
- `inventory_asset_identifiers`: `idx_inventory_asset_identifiers_lookup`, `idx_inventory_asset_identifiers_merchant_lookup`
- `inventory_assets`: `idx_inventory_assets_shop_status`
- `inventory_batches`: `idx_batches_lookup`
- `inventory_items`: `idx_inventory_items_shop`, `idx_inventory_items_shop_id`
- `inventory_movements`: `idx_inventory_movements_item_shop`, `idx_inventory_movements_report`
- `inventory_reconciliation_exceptions`: `idx_inventory_reconciliation`
- `inventory_reservations`: `idx_inventory_reservations_active`, `idx_inventory_reservations_item_shop`
- `inventory_transformations`: `idx_inventory_transformations_shop_date`
- `invoices`: `idx_invoices_shop_date`
- `journal_entries`: `idx_journal_entries_business_unit_date`, `idx_journal_entries_shop_date`
- `journal_lines`: `idx_journal_lines_account`, `idx_journal_lines_merchant_entry`
- `manager_shop_assignments`: `idx_manager_shop_assignments_active`, `idx_manager_shop_assignments_merchant`
- `merchant_modules`: `idx_merchant_modules_status`
- `merchants`: `idx_merchants_organization_active`
- `messages`: `idx_messages_conversation_sent`
- `notifications`: `idx_notifications_merchant_recipient`, `idx_notifications_recipient`
- `order_items`: `idx_order_items_order`, `idx_order_items_product`
- `orders`: `idx_orders_customer`, `idx_orders_source`
- `organizations`: `idx_organizations_parent_active`
- `outbox_events`: `idx_outbox_events_pending`
- `patient_allergies`: `idx_patient_allergies_patient`
- `patient_consents`: `idx_patient_consents_patient`
- `patient_contacts`: `idx_patient_contacts_patient`
- `patient_identifiers`: `idx_patient_identifiers_lookup`, `idx_patient_identifiers_patient`
- `patients`: `idx_patients_merchant_status`, `idx_patients_shop`
- `payment_proofs`: `idx_payment_proofs_merchant_payment`, `idx_payment_proofs_merchant_review`, `idx_payment_proofs_payment_status`
- `payment_provider_sessions`: `idx_payment_sessions_merchant_payment`, `idx_payment_sessions_payment_status`
- `payments`: `idx_payments_merchant_sale`, `idx_payments_refund`, `idx_payments_sale`
- `pos_sessions`: `idx_pos_sessions_one_open_per_terminal`
- `pos_transactions`: `idx_pos_transactions_merchant_session`, `idx_pos_transactions_session`
- `prescription_items`: `idx_prescription_items_prescription`
- `prescriptions`: `idx_prescriptions_encounter`, `idx_prescriptions_patient`
- `product_attribute_assignments`: `idx_product_attribute_assignments`
- `product_attributes`: `idx_product_attributes_lookup`, `idx_product_attributes_unique_scope`
- `product_categories`: `idx_product_categories_category`, `idx_product_categories_merchant`
- `product_images`: `idx_product_images_product`
- `product_prices`: `idx_product_prices_active_period`, `idx_product_prices_lookup`
- `product_variants`: `idx_product_variants_barcode`, `idx_product_variants_barcode_merchant`, `idx_product_variants_merchant`, `idx_product_variants_product`
- `products`: `idx_products_merchant_active`
- `promotion_products`: `idx_promotion_products_product`
- `promotions`: `idx_promotions_merchant_active`
- `purchase_order_items`: `idx_purchase_items_merchant_order`
- `purchase_orders`: `idx_purchase_orders_merchant_created`, `idx_purchase_orders_shop_status`
- `refresh_tokens`: `idx_refresh_tokens_user_expiry`
- `repair_approvals`: `idx_repair_approvals_order`
- `repair_device_identifiers`: `idx_repair_device_identifiers_device`, `idx_repair_device_identifiers_lookup`
- `repair_devices`: `idx_repair_devices_customer`
- `repair_diagnostics`: `idx_repair_diagnostics_order`
- `repair_order_parts`: `idx_repair_order_parts_customer_part`, `idx_repair_order_parts_inventory`, `idx_repair_order_parts_order`, `idx_repair_order_parts_shop_inventory`
- `repair_orders`: `idx_repair_orders_device`
- `repair_warranties`: `idx_repair_warranties_order`
- `roles`: `idx_roles_global_code`, `idx_roles_organization`
- `salary_payments`: `idx_salary_payments_merchant_staff`
- `sale_items`: `idx_sale_items_merchant_sale`, `idx_sale_items_merchant_shop_inventory`, `idx_sale_items_sale`
- `sales`: `idx_sales_client_merchant`, `idx_sales_report`
- `service_appointments`: `idx_service_appointments_patient`, `idx_service_appointments_schedule`
- `service_catalog`: `idx_service_catalog_active`
- `service_categories`: `idx_service_categories_tree`
- `service_order_assignments`: `idx_service_order_assignments_user`, `idx_service_order_one_primary_assignment`
- `service_order_attachments`: `idx_service_order_attachments_order`
- `service_order_billings`: `idx_service_order_billings_order`
- `service_order_items`: `idx_service_order_items_inventory`, `idx_service_order_items_order`, `idx_service_order_items_shop_inventory`
- `service_order_notes`: `idx_service_order_notes_order`
- `service_order_status_history`: `idx_service_order_status_history_order`
- `service_orders`: `idx_service_orders_customer`, `idx_service_orders_patient`, `idx_service_orders_status`
- `service_prices`: `idx_service_prices_lookup`
- `shop_customers`: `idx_shop_customers_email_lower`
- `shops`: `idx_shops_merchant_active`, `idx_shops_one_primary_per_merchant`
- `staff_contracts`: `idx_staff_contracts_merchant_staff`
- `stock_item_identifier_rules`: `idx_stock_item_identifier_rules_stock`, `idx_stock_item_identifier_rules_type`
- `stock_item_units`: `idx_stock_item_one_base_unit`
- `stock_items`: `idx_stock_items_merchant_name`, `idx_stock_items_product`
- `supplier_invoice_items`: `idx_supplier_invoice_items_invoice`
- `supplier_payments`: `idx_supplier_payments_merchant_invoice`
- `supplier_return_items`: `idx_supplier_return_items_return`
- `supplier_returns`: `idx_supplier_returns_shop_status`
- `suppliers`: `idx_suppliers_merchant_created`
- `support_messages`: `idx_support_messages_ticket_created`
- `support_tickets`: `idx_support_tickets_shop_status`
- `sync_changes`: `idx_sync_changes_entity`
- `sync_conflicts`: `idx_sync_conflicts_open`
- `sync_devices`: `idx_sync_devices_user`
- `sync_logs`: `idx_sync_logs_merchant_created`
- `sync_operations`: `idx_sync_operations_pending`
- `sync_sessions`: `idx_sync_sessions_device_status`
- `system_settings`: `idx_system_settings_updated`
- `tax_rates`: `idx_tax_rates_merchant_active`
- `testimonials`: `idx_testimonials_active`
- `treatment_plan_items`: `idx_treatment_plan_items_plan`
- `treatment_plans`: `idx_treatment_plans_patient`
- `user_identities`: `idx_user_identities_email_lower`
- `user_roles`: `idx_user_roles_one_platform_owner`, `idx_user_roles_role_active`, `idx_user_roles_unique_active_scope`, `idx_user_roles_user_active`
- `users`: `idx_users_email_lower`, `idx_users_locked_until`, `idx_users_merchant`, `idx_users_one_global_identity`, `idx_users_organization`
- `warehouse_inventory`: `idx_warehouse_inventory_lookup`
- `warehouse_inventory_movements`: `idx_warehouse_movements_report`
- `warehouse_locations`: `idx_warehouse_locations_tree`
- `warehouses`: `idx_warehouses_merchant_active`
- `workflow_executions`: `idx_workflow_executions_workflow_status`
- `workflow_logs`: `idx_workflow_logs_execution_created`
- `workflow_rules`: `idx_workflow_rules_workflow_order`
- `workflows`: `idx_workflows_trigger_active`

## Missing constraints

497 named old constraints are absent by exact name. Renamed/inline tenant-safe constraints are not semantic losses solely because their names changed.

- `accounting_periods`: `ck_accounting_period_date_range (CHECK)`, `ck_accounting_period_status_dates (CHECK)`, `fk_accounting_periods_closer_same_merchant (FOREIGN KEY)`, `uq_accounting_periods_merchant_id (UNIQUE)`
- `accounts`: `fk_accounts_shop_same_merchant (FOREIGN KEY)`, `uq_accounts_merchant_id (UNIQUE)`
- `accounts_payable_allocations`: `fk_ap_allocations_invoice_same_merchant (FOREIGN KEY)`, `fk_ap_allocations_payment_same_merchant (FOREIGN KEY)`, `uq_ap_allocations_merchant_id (UNIQUE)`
- `accounts_receivable_allocations`: `fk_ar_allocations_document_same_merchant (FOREIGN KEY)`, `fk_ar_allocations_payment_same_merchant (FOREIGN KEY)`, `uq_ar_allocations_merchant_id (UNIQUE)`
- `accounts_receivable_documents`: `ck_ar_document_balance (CHECK)`, `ck_ar_document_due_date (CHECK)`, `fk_ar_documents_customer_same_merchant (FOREIGN KEY)`, `fk_ar_documents_invoice_same_merchant (FOREIGN KEY)`, `fk_ar_documents_journal_same_merchant (FOREIGN KEY)`, `fk_ar_documents_period_same_merchant (FOREIGN KEY)`, `uq_ar_documents_merchant_id (UNIQUE)`
- `ai_providers`: `ck_ai_provider_no_plaintext_secrets (CHECK)`, `uq_ai_providers_merchant_id (UNIQUE)`
- `ai_requests`: `fk_ai_requests_provider_same_merchant (FOREIGN KEY)`, `fk_ai_requests_session_same_merchant (FOREIGN KEY)`
- `ai_sessions`: `fk_ai_sessions_user_same_merchant (FOREIGN KEY)`, `uq_ai_sessions_merchant_id (UNIQUE)`
- `audit_logs`: `ck_audit_logs_merchant_scope (CHECK)`, `fk_audit_logs_actor_same_merchant (FOREIGN KEY)`, `fk_audit_logs_merchant_same_organization (FOREIGN KEY)`
- `bank_accounts`: `fk_bank_accounts_account_same_merchant (FOREIGN KEY)`, `fk_bank_accounts_shop_same_merchant (FOREIGN KEY)`, `uq_bank_accounts_merchant_id (UNIQUE)`
- `bank_reconciliation_items`: `fk_bank_reconciliation_items_reconciliation_same_merchant (FOREIGN KEY)`, `fk_bank_reconciliation_items_transaction_same_merchant (FOREIGN KEY)`, `uq_bank_reconciliation_items_merchant_id (UNIQUE)`
- `bank_reconciliations`: `ck_bank_reconciliation_date_range (CHECK)`, `ck_bank_reconciliation_status_dates (CHECK)`, `fk_bank_reconciliations_account_same_merchant (FOREIGN KEY)`, `fk_bank_reconciliations_completer_same_merchant (FOREIGN KEY)`, `uq_bank_reconciliations_merchant_id (UNIQUE)`
- `bank_transactions`: `fk_bank_transactions_account_same_merchant (FOREIGN KEY)`, `fk_bank_transactions_journal_same_merchant (FOREIGN KEY)`, `uq_bank_transactions_merchant_id (UNIQUE)`
- `banner_image_list`: `fk_banner_image_list_shop_same_merchant (FOREIGN KEY)`, `uq_banner_image_list_merchant_id (UNIQUE)`
- `barcode_registry`: `ck_barcode_one_owner (CHECK)`, `fk_barcode_registry_asset_same_merchant (FOREIGN KEY)`, `fk_barcode_registry_batch_same_merchant (FOREIGN KEY)`, `fk_barcode_registry_product_same_merchant (FOREIGN KEY)`, `fk_barcode_registry_stock_same_merchant (FOREIGN KEY)`, `fk_barcode_registry_variant_same_merchant (FOREIGN KEY)`, `uq_barcode_registry_merchant_id (UNIQUE)`
- `business_units`: `ck_business_units_not_self_parent (CHECK)`, `fk_business_units_merchant_same_organization (FOREIGN KEY)`, `fk_business_units_organization (FOREIGN KEY)`, `fk_business_units_parent_same_organization (FOREIGN KEY)`, `uq_business_units_merchant_id (UNIQUE)`, `uq_business_units_organization_id (UNIQUE)`
- `cash_accounts`: `fk_cash_accounts_account_same_merchant (FOREIGN KEY)`, `fk_cash_accounts_shop_same_merchant (FOREIGN KEY)`, `uq_cash_accounts_merchant_id (UNIQUE)`
- `cash_transactions`: `fk_cash_transactions_account_same_merchant (FOREIGN KEY)`, `fk_cash_transactions_journal_same_merchant (FOREIGN KEY)`, `uq_cash_transactions_merchant_id (UNIQUE)`
- `categories`: `fk_categories_parent_same_merchant (FOREIGN KEY)`
- `communication_channels`: `ck_communication_channels_no_plaintext_secrets (CHECK)`, `uq_communication_channels_code (UNIQUE)`, `uq_communication_channels_merchant_id (UNIQUE)`
- `conversation_participants`: `ck_conversation_participants_reference (CHECK)`, `fk_conversation_participants_conversation_same_merchant (FOREIGN KEY)`, `fk_conversation_participants_customer_same_merchant (FOREIGN KEY)`, `fk_conversation_participants_user_same_merchant (FOREIGN KEY)`, `uq_conversation_participants_merchant_id (UNIQUE)`
- `conversations`: `fk_conversations_customer_same_merchant (FOREIGN KEY)`, `uq_conversations_merchant_id (UNIQUE)`
- `custom_field_definitions`: `fk_custom_field_definitions_merchant (FOREIGN KEY)`, `uq_custom_field_definitions_merchant_id (UNIQUE)`
- `custom_field_values`: `fk_custom_field_values_definition_same_merchant (FOREIGN KEY)`, `fk_custom_field_values_merchant (FOREIGN KEY)`, `uq_custom_field_values_merchant_id (UNIQUE)`
- `customer_activities`: `fk_customer_activities_customer_same_merchant (FOREIGN KEY)`
- `customer_addresses`: `fk_customer_addresses_customer_same_merchant (FOREIGN KEY)`, `uq_customer_addresses_merchant_id (UNIQUE)`
- `customer_notes`: `fk_customer_notes_author_same_merchant (FOREIGN KEY)`, `fk_customer_notes_customer_same_merchant (FOREIGN KEY)`
- `customer_tag_map`: `fk_customer_tag_map_customer_same_merchant (FOREIGN KEY)`, `fk_customer_tag_map_tag_same_merchant (FOREIGN KEY)`
- `customer_tags`: `uq_customer_tags_merchant_id (UNIQUE)`
- `customers`: `fk_customers_user_same_merchant (FOREIGN KEY)`, `uq_customers_merchant_id (UNIQUE)`
- `document_sequences`: `fk_document_sequences_merchant (FOREIGN KEY)`, `uq_document_sequences_merchant_id (UNIQUE)`
- `ecommerce_cart_items`: `fk_ecommerce_cart_items_cart_same_merchant (FOREIGN KEY)`, `fk_ecommerce_cart_items_product_same_merchant (FOREIGN KEY)`, `fk_ecommerce_cart_items_variant_same_merchant (FOREIGN KEY)`, `uq_ecommerce_cart_items_merchant_id (UNIQUE)`
- `ecommerce_carts`: `fk_ecommerce_carts_customer_same_merchant (FOREIGN KEY)`, `fk_ecommerce_carts_store_same_merchant (FOREIGN KEY)`, `uq_ecommerce_carts_merchant_id (UNIQUE)`
- `ecommerce_checkout_sessions`: `ck_ecommerce_checkout_total_consistency (CHECK)`, `fk_ecommerce_checkout_sessions_cart_same_merchant (FOREIGN KEY)`, `fk_ecommerce_checkout_sessions_customer_same_merchant (FOREIGN KEY)`, `fk_ecommerce_checkout_sessions_payment_same_merchant (FOREIGN KEY)`, `fk_ecommerce_checkout_sessions_store_same_merchant (FOREIGN KEY)`, `uq_ecommerce_checkout_sessions_merchant_id (UNIQUE)`
- `ecommerce_customer_accounts`: `fk_ecommerce_customer_accounts_customer_same_merchant (FOREIGN KEY)`, `uq_ecommerce_customer_accounts_merchant_id (UNIQUE)`
- `ecommerce_order_events`: `ck_ecommerce_order_events_from_status (CHECK)`, `fk_ecommerce_order_events_creator_same_merchant (FOREIGN KEY)`, `fk_ecommerce_order_events_order_same_merchant (FOREIGN KEY)`, `uq_ecommerce_order_events_merchant_id (UNIQUE)`
- `ecommerce_order_items`: `ck_ecommerce_order_item_total_consistency (CHECK)`, `fk_ecommerce_order_items_order_same_merchant (FOREIGN KEY)`, `fk_ecommerce_order_items_product_same_merchant (FOREIGN KEY)`, `fk_ecommerce_order_items_variant_same_merchant (FOREIGN KEY)`, `uq_ecommerce_order_items_merchant_id (UNIQUE)`
- `ecommerce_orders`: `ck_ecommerce_order_total_consistency (CHECK)`, `fk_ecommerce_orders_checkout_same_merchant (FOREIGN KEY)`, `fk_ecommerce_orders_customer_same_merchant (FOREIGN KEY)`, `fk_ecommerce_orders_sale_same_merchant (FOREIGN KEY)`, `fk_ecommerce_orders_store_same_merchant (FOREIGN KEY)`, `uq_ecommerce_orders_merchant_id (UNIQUE)`, `uq_ecommerce_orders_sale (UNIQUE)`
- `ecommerce_shipment_items`: `fk_ecommerce_shipment_items_order_item_same_merchant (FOREIGN KEY)`, `fk_ecommerce_shipment_items_shipment_same_merchant (FOREIGN KEY)`, `uq_ecommerce_shipment_items_merchant_id (UNIQUE)`
- `ecommerce_shipments`: `ck_ecommerce_shipment_delivery_dates (CHECK)`, `fk_ecommerce_shipments_order_same_merchant (FOREIGN KEY)`, `uq_ecommerce_shipments_merchant_id (UNIQUE)`
- `ecommerce_store_products`: `fk_ecommerce_store_products_product_same_merchant (FOREIGN KEY)`, `fk_ecommerce_store_products_store_same_merchant (FOREIGN KEY)`, `uq_ecommerce_store_products_merchant_id (UNIQUE)`
- `ecommerce_stores`: `fk_ecommerce_stores_shop_same_merchant (FOREIGN KEY)`, `uq_ecommerce_stores_merchant_id (UNIQUE)`
- `email_queue`: `ck_email_queue_sent_state (CHECK)`, `fk_email_queue_template_same_merchant (FOREIGN KEY)`, `uq_email_queue_merchant_id (UNIQUE)`
- `email_templates`: `uq_email_templates_merchant_id (UNIQUE)`, `uq_email_templates_name_locale (UNIQUE)`
- `expense_items`: `ck_expense_item_total_consistency (CHECK)`, `fk_expense_items_account_same_merchant (FOREIGN KEY)`, `fk_expense_items_expense_same_merchant (FOREIGN KEY)`, `fk_expense_items_tax_rate_same_merchant (FOREIGN KEY)`, `uq_expense_items_merchant_id (UNIQUE)`
- `expenses`: `ck_expense_total_consistency (CHECK)`, `fk_expenses_business_unit_same_merchant (FOREIGN KEY)`, `fk_expenses_creator_same_merchant (FOREIGN KEY)`, `fk_expenses_journal_same_merchant (FOREIGN KEY)`, `fk_expenses_payment_account_same_merchant (FOREIGN KEY)`, `fk_expenses_period_same_merchant (FOREIGN KEY)`, `fk_expenses_shop_same_merchant (FOREIGN KEY)`, `fk_expenses_supplier_same_merchant (FOREIGN KEY)`, `uq_expenses_merchant_id (UNIQUE)`
- `file_objects`: `fk_file_objects_uploader_same_merchant (FOREIGN KEY)`
- `goods_receipt_items`: `ck_goods_receipt_items_base_quantity_positive (CHECK)`, `fk_goods_receipt_items_product_same_merchant (FOREIGN KEY)`, `fk_goods_receipt_items_receipt_same_merchant (FOREIGN KEY)`, `fk_goods_receipt_items_stock_same_merchant (FOREIGN KEY)`
- `goods_receipts`: `fk_goods_receipts_order_same_merchant (FOREIGN KEY)`, `fk_goods_receipts_receiver_same_merchant (FOREIGN KEY)`, `uq_goods_receipts_merchant_id (UNIQUE)`
- `guest_order_access_tokens`: `uq_guest_order_access_tokens_merchant_id (UNIQUE)`, `uq_guest_order_access_tokens_token (UNIQUE)`
- `guest_order_verifications`: `uq_guest_order_verifications_merchant_id (UNIQUE)`, `uq_guest_order_verifications_token (UNIQUE)`
- `idempotency_keys`: `ck_idempotency_keys_response (CHECK)`, `fk_idempotency_keys_merchant_same_organization (FOREIGN KEY)`, `fk_idempotency_keys_organization (FOREIGN KEY)`
- `integration_connections`: `ck_integration_connections_no_plaintext_secrets (CHECK)`, `fk_integration_connections_merchant_same_organization (FOREIGN KEY)`, `fk_integration_connections_organization (FOREIGN KEY)`, `uq_integration_connections_organization_id (UNIQUE)`
- `inventory_asset_identifiers`: `fk_asset_identifiers_asset_same_merchant (FOREIGN KEY)`, `fk_asset_identifiers_type_same_merchant (FOREIGN KEY)`
- `inventory_assets`: `fk_inventory_assets_batch_same_merchant (FOREIGN KEY)`, `fk_inventory_assets_inventory_same_merchant (FOREIGN KEY)`, `fk_inventory_assets_inventory_same_shop (FOREIGN KEY)`, `fk_inventory_assets_shop_same_merchant (FOREIGN KEY)`, `uq_inventory_assets_merchant_id (UNIQUE)`
- `inventory_batches`: `ck_inventory_batch_remaining_not_over_received (CHECK)`, `fk_inventory_batches_inventory_same_merchant (FOREIGN KEY)`, `fk_inventory_batches_inventory_same_shop (FOREIGN KEY)`, `fk_inventory_batches_product_same_merchant (FOREIGN KEY)`, `fk_inventory_batches_shop_same_merchant (FOREIGN KEY)`, `fk_inventory_batches_stock_same_merchant (FOREIGN KEY)`, `uq_inventory_batches_merchant_id (UNIQUE)`
- `inventory_identifier_types`: `uq_inventory_identifier_types_merchant_id (UNIQUE)`
- `inventory_items`: `ck_inventory_reserved_not_over_on_hand (CHECK)`, `fk_inventory_items_product_same_merchant (FOREIGN KEY)`, `fk_inventory_items_product_variant_same_product (FOREIGN KEY)`, `fk_inventory_items_shop_same_merchant (FOREIGN KEY)`, `fk_inventory_items_stock_same_merchant (FOREIGN KEY)`, `fk_inventory_items_variant_same_merchant (FOREIGN KEY)`, `uq_inventory_items_merchant_id (UNIQUE)`, `uq_inventory_items_merchant_shop_id (UNIQUE)`
- `inventory_movements`: `ck_inventory_movement_base_quantity_positive (CHECK)`, `ck_inventory_movement_delta (CHECK)`, `fk_inventory_movements_inventory_same_merchant (FOREIGN KEY)`, `fk_inventory_movements_inventory_same_shop (FOREIGN KEY)`, `fk_inventory_movements_product_same_merchant (FOREIGN KEY)`, `fk_inventory_movements_shop_same_merchant (FOREIGN KEY)`, `fk_inventory_movements_stock_same_merchant (FOREIGN KEY)`
- `inventory_operations`: `fk_inventory_operations_actor_same_merchant (FOREIGN KEY)`, `fk_inventory_operations_shop_same_merchant (FOREIGN KEY)`, `uq_inventory_operations_merchant_id (UNIQUE)`
- `inventory_reconciliation_exceptions`: `ck_inventory_exception_resolution (CHECK)`, `fk_inventory_exceptions_resolver_same_merchant (FOREIGN KEY)`, `fk_inventory_exceptions_shop_same_merchant (FOREIGN KEY)`, `uq_inventory_exceptions_merchant_id (UNIQUE)`
- `inventory_reservations`: `ck_inventory_reservation_base_quantity_positive (CHECK)`, `ck_inventory_reservation_release (CHECK)`, `fk_inventory_reservations_inventory_same_merchant (FOREIGN KEY)`, `fk_inventory_reservations_inventory_same_shop (FOREIGN KEY)`, `fk_inventory_reservations_product_same_merchant (FOREIGN KEY)`, `fk_inventory_reservations_shop_same_merchant (FOREIGN KEY)`, `fk_inventory_reservations_stock_same_merchant (FOREIGN KEY)`
- `inventory_serials`: `fk_inventory_serials_inventory_same_merchant (FOREIGN KEY)`, `fk_inventory_serials_inventory_same_shop (FOREIGN KEY)`, `fk_inventory_serials_product_same_merchant (FOREIGN KEY)`, `fk_inventory_serials_shop_same_merchant (FOREIGN KEY)`, `fk_inventory_serials_stock_same_merchant (FOREIGN KEY)`
- `inventory_transformation_lines`: `fk_transformation_lines_inventory_same_merchant (FOREIGN KEY)`, `fk_transformation_lines_stock_same_merchant (FOREIGN KEY)`, `fk_transformation_lines_transformation_same_merchant (FOREIGN KEY)`
- `inventory_transformations`: `ck_inventory_transformation_reference_type (CHECK)`, `fk_inventory_transformations_creator_same_merchant (FOREIGN KEY)`, `fk_inventory_transformations_shop_same_merchant (FOREIGN KEY)`, `uq_inventory_transformations_merchant_id (UNIQUE)`
- `invoices`: `ck_invoices_amounts_nonnegative (CHECK)`, `ck_invoices_due_date (CHECK)`, `ck_invoices_payment_status (CHECK)`, `ck_invoices_total_consistency (CHECK)`, `fk_invoices_customer_same_merchant (FOREIGN KEY)`, `fk_invoices_sale_same_merchant (FOREIGN KEY)`, `fk_invoices_sale_same_shop (FOREIGN KEY)`, `fk_invoices_shop_same_merchant (FOREIGN KEY)`, `uq_invoices_merchant_id (UNIQUE)`
- `journal_entries`: `ck_journal_entry_posting_state (CHECK)`, `fk_journal_entries_business_unit_same_merchant (FOREIGN KEY)`, `fk_journal_entries_period_same_merchant (FOREIGN KEY)`, `fk_journal_entries_shop_same_merchant (FOREIGN KEY)`, `uq_journal_entries_merchant_id (UNIQUE)`
- `journal_lines`: `fk_journal_lines_account_same_merchant (FOREIGN KEY)`, `fk_journal_lines_entry_same_merchant (FOREIGN KEY)`
- `ledger_balances`: `fk_ledger_balances_account_same_merchant (FOREIGN KEY)`
- `manager_shop_assignments`: `ck_manager_assignment_status_dates (CHECK)`, `fk_manager_assignments_assigner (FOREIGN KEY)`, `fk_manager_assignments_manager_same_merchant (FOREIGN KEY)`, `fk_manager_assignments_shop_same_merchant (FOREIGN KEY)`
- `merchant_modules`: `ck_merchant_modules_status_dates (CHECK)`, `fk_merchant_modules_merchant (FOREIGN KEY)`, `uq_merchant_modules_merchant_id (UNIQUE)`
- `merchant_payment_configurations`: `ck_payment_config_no_plaintext_secrets (CHECK)`, `fk_payment_config_shop_same_merchant (FOREIGN KEY)`
- `merchants`: `fk_merchants_organization (FOREIGN KEY)`, `uq_merchants_organization_id (UNIQUE)`
- `messages`: `fk_messages_conversation_same_merchant (FOREIGN KEY)`, `fk_messages_sender_same_merchant (FOREIGN KEY)`, `uq_messages_merchant_id (UNIQUE)`
- `notifications`: `fk_notifications_recipient_same_merchant (FOREIGN KEY)`, `uq_notifications_merchant_id (UNIQUE)`
- `order_items`: `ck_order_items_base_quantity_positive (CHECK)`, `ck_order_items_reference (CHECK)`, `ck_order_items_total_consistency (CHECK)`, `fk_order_items_order_same_merchant (FOREIGN KEY)`, `fk_order_items_product_same_merchant (FOREIGN KEY)`, `fk_order_items_service_same_merchant (FOREIGN KEY)`, `fk_order_items_stock_same_merchant (FOREIGN KEY)`, `fk_order_items_unit (FOREIGN KEY)`, `fk_order_items_variant_same_product (FOREIGN KEY)`, `uq_order_items_merchant_id (UNIQUE)`
- `orders`: `ck_orders_single_operational_link (CHECK)`, `ck_orders_total_consistency (CHECK)`, `fk_orders_customer_same_merchant (FOREIGN KEY)`, `fk_orders_ecommerce_order_same_merchant (FOREIGN KEY)`, `fk_orders_sale_same_merchant (FOREIGN KEY)`, `fk_orders_shop_same_merchant (FOREIGN KEY)`, `uq_orders_merchant_id (UNIQUE)`, `uq_orders_order_number (UNIQUE)`, `uq_orders_request_key (UNIQUE)`
- `organizations`: `ck_organizations_not_self_parent (CHECK)`, `fk_organizations_parent (FOREIGN KEY)`
- `outbox_events`: `ck_outbox_events_publish_attempts (CHECK)`, `fk_outbox_events_merchant_same_organization (FOREIGN KEY)`, `fk_outbox_events_organization (FOREIGN KEY)`
- `payment_proofs`: `fk_payment_proofs_payment_same_merchant (FOREIGN KEY)`, `fk_payment_proofs_reviewer_same_merchant (FOREIGN KEY)`, `fk_payment_proofs_uploader_same_merchant (FOREIGN KEY)`, `uq_payment_proofs_merchant_id (UNIQUE)`
- `payment_provider_sessions`: `fk_payment_sessions_payment_same_merchant (FOREIGN KEY)`, `uq_payment_provider_sessions_merchant_id (UNIQUE)`
- `payment_settings`: `ck_payment_settings_charges_nonnegative (CHECK)`, `ck_payment_settings_tax_range (CHECK)`, `fk_payment_settings_shop_same_merchant (FOREIGN KEY)`
- `payments`: `ck_payments_amount_positive (CHECK)`, `fk_payments_refund_same_merchant (FOREIGN KEY)`, `fk_payments_sale_same_merchant (FOREIGN KEY)`, `uq_payments_merchant_id (UNIQUE)`
- `pos_sessions`: `fk_pos_sessions_reconciler_same_merchant (FOREIGN KEY)`, `fk_pos_sessions_shop_same_merchant (FOREIGN KEY)`, `fk_pos_sessions_terminal_same_shop (FOREIGN KEY)`, `fk_pos_sessions_user_same_merchant (FOREIGN KEY)`, `uq_pos_sessions_merchant_id (UNIQUE)`
- `pos_terminals`: `fk_pos_terminals_shop_same_merchant (FOREIGN KEY)`, `uq_pos_terminals_merchant_id (UNIQUE)`, `uq_pos_terminals_merchant_shop_id (UNIQUE)`
- `pos_transactions`: `fk_pos_transactions_sale_same_merchant (FOREIGN KEY)`, `fk_pos_transactions_session_same_merchant (FOREIGN KEY)`
- `product_attribute_assignments`: `ck_product_attribute_has_value (CHECK)`, `fk_product_attribute_assignments_product_variant_same_product (FOREIGN KEY)`, `fk_product_attributes_definition_same_merchant (FOREIGN KEY)`, `fk_product_attributes_product_same_merchant (FOREIGN KEY)`, `fk_product_attributes_variant_same_merchant_product (FOREIGN KEY)`
- `product_attributes`: `ck_product_attributes_key_nonblank (CHECK)`, `fk_product_attributes_product_same_merchant (FOREIGN KEY)`, `fk_product_attributes_variant_same_product (FOREIGN KEY)`, `uq_product_attributes_merchant_id (UNIQUE)`
- `product_categories`: `fk_product_categories_category_same_merchant (FOREIGN KEY)`, `fk_product_categories_product_same_merchant (FOREIGN KEY)`
- `product_prices`: `ck_product_prices_date_range (CHECK)`, `ex_product_prices_no_overlap (EXCLUDE)`, `fk_product_prices_product_same_merchant (FOREIGN KEY)`, `fk_product_prices_product_variant_same_product (FOREIGN KEY)`, `fk_product_prices_shop_same_merchant (FOREIGN KEY)`, `fk_product_prices_variant_same_merchant (FOREIGN KEY)`
- `product_variants`: `fk_product_variants_product_same_merchant (FOREIGN KEY)`
- `promotion_products`: `fk_promotion_products_product_same_merchant (FOREIGN KEY)`, `fk_promotion_products_promotion_same_merchant (FOREIGN KEY)`
- `promotions`: `ck_promotions_date_range (CHECK)`, `ck_promotions_percentage_range (CHECK)`, `ck_promotions_usage_range (CHECK)`, `fk_promotions_shop_same_merchant (FOREIGN KEY)`, `uq_promotions_merchant_code (UNIQUE)`, `uq_promotions_merchant_id_id (UNIQUE)`
- `purchase_order_items`: `ck_purchase_order_items_received_range (CHECK)`, `ck_purchase_order_items_total_consistency (CHECK)`, `fk_purchase_items_order_same_merchant (FOREIGN KEY)`, `fk_purchase_items_product_same_merchant (FOREIGN KEY)`, `fk_purchase_items_stock_same_merchant (FOREIGN KEY)`
- `purchase_orders`: `ck_purchase_orders_amounts_nonnegative (CHECK)`, `fk_purchase_orders_shop_same_merchant (FOREIGN KEY)`, `fk_purchase_orders_supplier_same_merchant (FOREIGN KEY)`, `uq_purchase_orders_merchant_id (UNIQUE)`
- `roles`: `fk_roles_organization (FOREIGN KEY)`, `uq_roles_organization_id (UNIQUE)`
- `salary_payments`: `ck_salary_payment_period (CHECK)`, `fk_salary_payments_staff_same_merchant (FOREIGN KEY)`, `uq_salary_payments_merchant_id (UNIQUE)`
- `sale_items`: `ck_sale_items_original_price_nonnegative (CHECK)`, `ck_sale_items_product_reference (CHECK)`, `ck_sale_items_subtotal_consistency (CHECK)`, `fk_sale_items_inventory_same_merchant (FOREIGN KEY)`, `fk_sale_items_inventory_same_shop (FOREIGN KEY)`, `fk_sale_items_product_same_merchant (FOREIGN KEY)`, `fk_sale_items_product_variant_same_product (FOREIGN KEY)`, `fk_sale_items_sale_same_merchant (FOREIGN KEY)`, `fk_sale_items_sale_same_shop (FOREIGN KEY)`, `fk_sale_items_stock_same_merchant (FOREIGN KEY)`, `fk_sale_items_variant_same_merchant (FOREIGN KEY)`
- `sales`: `ck_sales_payment_status (CHECK)`, `fk_sales_customer_same_merchant (FOREIGN KEY)`, `fk_sales_promotion_same_merchant (FOREIGN KEY)`, `fk_sales_shop_same_merchant (FOREIGN KEY)`, `fk_sales_staff_same_merchant (FOREIGN KEY)`, `uq_sales_merchant_client_sale (UNIQUE)`, `uq_sales_merchant_id (UNIQUE)`, `uq_sales_merchant_shop_id (UNIQUE)`
- `service_appointments`: `ex_service_appointments_shop_overlap (EXCLUDE)`, `ex_service_appointments_staff_overlap (EXCLUDE)`
- `shop_customers`: `fk_shop_customers_shop_same_merchant (FOREIGN KEY)`, `uq_shop_customers_merchant_id (UNIQUE)`
- `staff_contracts`: `ck_staff_contract_dates (CHECK)`, `fk_staff_contracts_staff_same_merchant (FOREIGN KEY)`, `uq_staff_contracts_merchant_id (UNIQUE)`
- `stock_item_identifier_rules`: `ck_stock_item_identifier_rules_required_count (CHECK)`, `fk_stock_item_identifier_rules_stock_same_merchant (FOREIGN KEY)`, `fk_stock_item_identifier_rules_type_same_merchant (FOREIGN KEY)`, `uq_stock_item_identifier_rules_merchant_id (UNIQUE)`, `uq_stock_item_identifier_rules_pair (UNIQUE)`
- `stock_item_unit_conversions`: `ck_stock_unit_conversion_distinct_units (CHECK)`
- `stock_items`: `fk_stock_items_product_same_merchant (FOREIGN KEY)`, `fk_stock_items_product_variant_same_product (FOREIGN KEY)`, `fk_stock_items_variant_same_merchant (FOREIGN KEY)`
- `supplier_invoice_items`: `ck_supplier_invoice_item_quantity (CHECK)`, `fk_supplier_invoice_items_invoice_same_merchant (FOREIGN KEY)`, `fk_supplier_invoice_items_product_same_merchant (FOREIGN KEY)`, `fk_supplier_invoice_items_stock_same_merchant (FOREIGN KEY)`, `uq_supplier_invoice_items_merchant_id (UNIQUE)`
- `supplier_invoices`: `ck_supplier_invoices_total_nonnegative (CHECK)`, `fk_supplier_invoices_order_same_merchant (FOREIGN KEY)`, `fk_supplier_invoices_supplier_same_merchant (FOREIGN KEY)`, `uq_supplier_invoices_merchant_id (UNIQUE)`
- `supplier_payments`: `fk_supplier_payments_invoice_same_merchant (FOREIGN KEY)`, `uq_supplier_payments_merchant_id (UNIQUE)`
- `supplier_return_items`: `ck_supplier_return_item_total_consistency (CHECK)`, `fk_supplier_return_items_batch_same_merchant (FOREIGN KEY)`, `fk_supplier_return_items_product_same_merchant (FOREIGN KEY)`, `fk_supplier_return_items_return_same_merchant (FOREIGN KEY)`, `fk_supplier_return_items_stock_same_merchant (FOREIGN KEY)`, `uq_supplier_return_items_merchant_id (UNIQUE)`
- `supplier_returns`: `fk_supplier_returns_creator_same_merchant (FOREIGN KEY)`, `fk_supplier_returns_invoice_same_merchant (FOREIGN KEY)`, `fk_supplier_returns_order_same_merchant (FOREIGN KEY)`, `fk_supplier_returns_shop_same_merchant (FOREIGN KEY)`, `fk_supplier_returns_supplier_same_merchant (FOREIGN KEY)`, `uq_supplier_returns_merchant_id (UNIQUE)`
- `suppliers`: `uq_suppliers_merchant_id (UNIQUE)`
- `support_tickets`: `ck_support_ticket_priority (CHECK)`, `ck_support_ticket_scope (CHECK)`, `ck_support_ticket_status (CHECK)`, `fk_support_tickets_shop_same_merchant (FOREIGN KEY)`
- `sync_changes`: `fk_sync_changes_device_same_merchant (FOREIGN KEY)`, `fk_sync_changes_merchant (FOREIGN KEY)`, `fk_sync_changes_operation_same_merchant (FOREIGN KEY)`, `uq_sync_changes_entity_version (UNIQUE)`, `uq_sync_changes_merchant_id (UNIQUE)`, `uq_sync_changes_server_sequence (UNIQUE)`, `uq_sync_changes_source_operation (UNIQUE)`
- `sync_checkpoints`: `fk_sync_checkpoints_device_same_merchant (FOREIGN KEY)`, `fk_sync_checkpoints_merchant (FOREIGN KEY)`, `uq_sync_checkpoints_merchant_id (UNIQUE)`, `uq_sync_checkpoints_scope (UNIQUE)`
- `sync_conflicts`: `ck_sync_conflict_resolution (CHECK)`, `fk_sync_conflicts_merchant (FOREIGN KEY)`, `fk_sync_conflicts_operation_same_merchant (FOREIGN KEY)`, `fk_sync_conflicts_resolver_same_merchant (FOREIGN KEY)`, `uq_sync_conflicts_merchant_id (UNIQUE)`
- `sync_devices`: `fk_sync_devices_merchant (FOREIGN KEY)`, `fk_sync_devices_user_same_merchant (FOREIGN KEY)`, `uq_sync_devices_identifier (UNIQUE)`, `uq_sync_devices_merchant_id (UNIQUE)`
- `sync_entity_versions`: `fk_sync_entity_versions_merchant (FOREIGN KEY)`, `uq_sync_entity_versions_entity (UNIQUE)`, `uq_sync_entity_versions_merchant_id (UNIQUE)`
- `sync_logs`: `ck_sync_log_counts (CHECK)`
- `sync_operations`: `ck_sync_operation_applied_at (CHECK)`, `ck_sync_operation_versions (CHECK)`, `fk_sync_operations_device_same_merchant (FOREIGN KEY)`, `fk_sync_operations_merchant (FOREIGN KEY)`, `fk_sync_operations_session_same_merchant (FOREIGN KEY)`, `uq_sync_operations_client_key (UNIQUE)`, `uq_sync_operations_merchant_id (UNIQUE)`, `uq_sync_operations_server_sequence (UNIQUE)`
- `sync_sessions`: `ck_sync_session_completion (CHECK)`, `ck_sync_session_sequence (CHECK)`, `fk_sync_sessions_device_same_merchant (FOREIGN KEY)`, `fk_sync_sessions_merchant (FOREIGN KEY)`, `uq_sync_sessions_client_key (UNIQUE)`, `uq_sync_sessions_merchant_id (UNIQUE)`
- `tax_rates`: `ck_tax_rate_date_range (CHECK)`, `uq_tax_rates_merchant_id (UNIQUE)`
- `testimonials`: `uq_testimonials_merchant_id (UNIQUE)`
- `user_roles`: `ck_user_roles_dates (CHECK)`, `ck_user_roles_scope (CHECK)`, `fk_user_roles_merchant_same_organization (FOREIGN KEY)`, `fk_user_roles_organization (FOREIGN KEY)`, `fk_user_roles_shop_same_merchant (FOREIGN KEY)`, `fk_user_roles_user_same_merchant (FOREIGN KEY)`, `fk_user_roles_user_same_organization (FOREIGN KEY)`
- `users`: `ck_users_home_shop_scope (CHECK)`, `fk_users_assigned_shop (FOREIGN KEY)`, `fk_users_identity (FOREIGN KEY)`, `fk_users_merchant_same_organization (FOREIGN KEY)`, `uq_users_merchant_id_id (UNIQUE)`
- `warehouse_inventory`: `ck_warehouse_inventory_reserved_not_over_on_hand (CHECK)`, `fk_warehouse_inventory_location_same_warehouse (FOREIGN KEY)`, `fk_warehouse_inventory_product_same_merchant (FOREIGN KEY)`, `fk_warehouse_inventory_product_variant_same_product (FOREIGN KEY)`, `fk_warehouse_inventory_stock_same_merchant (FOREIGN KEY)`, `fk_warehouse_inventory_variant_same_merchant (FOREIGN KEY)`, `fk_warehouse_inventory_warehouse_same_merchant (FOREIGN KEY)`, `uq_warehouse_inventory_location_id (UNIQUE)`, `uq_warehouse_inventory_merchant_id (UNIQUE)`
- `warehouse_inventory_movements`: `ck_warehouse_movement_delta (CHECK)`, `ck_warehouse_movement_unit_cost_nonnegative (CHECK)`, `fk_warehouse_movements_inventory_location (FOREIGN KEY)`, `fk_warehouse_movements_inventory_same_merchant (FOREIGN KEY)`, `fk_warehouse_movements_location_same_warehouse (FOREIGN KEY)`, `fk_warehouse_movements_warehouse_same_merchant (FOREIGN KEY)`
- `warehouse_locations`: `ck_warehouse_locations_not_self_parent (CHECK)`, `fk_warehouse_locations_parent_same_warehouse (FOREIGN KEY)`, `fk_warehouse_locations_warehouse_same_merchant (FOREIGN KEY)`, `uq_warehouse_locations_merchant_id (UNIQUE)`, `uq_warehouse_locations_warehouse_id (UNIQUE)`
- `warehouses`: `fk_warehouses_merchant (FOREIGN KEY)`, `fk_warehouses_shop_same_merchant (FOREIGN KEY)`, `uq_warehouses_merchant_id (UNIQUE)`
- `workflow_executions`: `ck_workflow_executions_completion (CHECK)`, `fk_workflow_executions_workflow_same_merchant (FOREIGN KEY)`, `uq_workflow_executions_event_key (UNIQUE)`, `uq_workflow_executions_merchant_id (UNIQUE)`
- `workflow_logs`: `fk_workflow_logs_execution_same_merchant (FOREIGN KEY)`, `uq_workflow_logs_merchant_id (UNIQUE)`
- `workflow_rules`: `fk_workflow_rules_workflow_same_merchant (FOREIGN KEY)`, `uq_workflow_rules_merchant_id (UNIQUE)`, `uq_workflow_rules_order (UNIQUE)`
- `workflows`: `uq_workflows_merchant_id (UNIQUE)`, `uq_workflows_name (UNIQUE)`

## Missing RLS policies

150 old logical `tenant_isolation` policies are absent because their old tables were removed/consolidated:

- `tenant_isolation ON accounting_periods`
- `tenant_isolation ON accounts`
- `tenant_isolation ON accounts_payable_allocations`
- `tenant_isolation ON accounts_receivable_allocations`
- `tenant_isolation ON accounts_receivable_documents`
- `tenant_isolation ON ai_providers`
- `tenant_isolation ON ai_requests`
- `tenant_isolation ON ai_sessions`
- `tenant_isolation ON attribute_definitions`
- `tenant_isolation ON audit_logs`
- `tenant_isolation ON bank_accounts`
- `tenant_isolation ON bank_reconciliation_items`
- `tenant_isolation ON bank_reconciliations`
- `tenant_isolation ON bank_transactions`
- `tenant_isolation ON banner_image_list`
- `tenant_isolation ON barcode_registry`
- `tenant_isolation ON brands`
- `tenant_isolation ON business_units`
- `tenant_isolation ON cash_accounts`
- `tenant_isolation ON cash_transactions`
- `tenant_isolation ON categories`
- `tenant_isolation ON clinical_diagnoses`
- `tenant_isolation ON clinical_encounters`
- `tenant_isolation ON clinical_measurements`
- `tenant_isolation ON clinical_notes`
- `tenant_isolation ON clinical_procedures`
- `tenant_isolation ON communication_channels`
- `tenant_isolation ON conversation_participants`
- `tenant_isolation ON conversations`
- `tenant_isolation ON custom_field_definitions`
- `tenant_isolation ON custom_field_values`
- `tenant_isolation ON customer_activities`
- `tenant_isolation ON customer_notes`
- `tenant_isolation ON customer_supplied_parts`
- `tenant_isolation ON customer_tag_map`
- `tenant_isolation ON customer_tags`
- `tenant_isolation ON document_sequences`
- `tenant_isolation ON ecommerce_customer_accounts`
- `tenant_isolation ON ecommerce_customer_addresses`
- `tenant_isolation ON ecommerce_order_discounts`
- `tenant_isolation ON ecommerce_order_events`
- `tenant_isolation ON ecommerce_order_item_allocations`
- `tenant_isolation ON ecommerce_order_items`
- `tenant_isolation ON ecommerce_orders`
- `tenant_isolation ON ecommerce_promotion_codes`
- `tenant_isolation ON ecommerce_promotion_redemptions`
- `tenant_isolation ON ecommerce_refunds`
- `tenant_isolation ON ecommerce_return_items`
- `tenant_isolation ON ecommerce_shipment_items`
- `tenant_isolation ON ecommerce_shipments`
- `tenant_isolation ON ecommerce_shipping_methods`
- `tenant_isolation ON ecommerce_store_fulfillment_locations`
- `tenant_isolation ON ecommerce_store_product_variants`
- `tenant_isolation ON ecommerce_store_products`
- `tenant_isolation ON ecommerce_stores`
- `tenant_isolation ON email_queue`
- `tenant_isolation ON email_templates`
- `tenant_isolation ON expense_items`
- `tenant_isolation ON expenses`
- `tenant_isolation ON file_objects`
- `tenant_isolation ON goods_receipt_items`
- `tenant_isolation ON guest_order_access_tokens`
- `tenant_isolation ON guest_order_verifications`
- `tenant_isolation ON idempotency_keys`
- `tenant_isolation ON integration_connections`
- `tenant_isolation ON inventory_asset_identifiers`
- `tenant_isolation ON inventory_identifier_types`
- `tenant_isolation ON inventory_items`
- `tenant_isolation ON inventory_operations`
- `tenant_isolation ON inventory_reconciliation_exceptions`
- `tenant_isolation ON inventory_transformation_lines`
- `tenant_isolation ON inventory_transformations`
- `tenant_isolation ON invoices`
- `tenant_isolation ON ledger_balances`
- `tenant_isolation ON manager_shop_assignments`
- `tenant_isolation ON merchant_modules`
- `tenant_isolation ON merchant_payment_configurations`
- `tenant_isolation ON messages`
- `tenant_isolation ON notifications`
- `tenant_isolation ON order_items`
- `tenant_isolation ON outbox_events`
- `tenant_isolation ON patient_allergies`
- `tenant_isolation ON patient_consents`
- `tenant_isolation ON patient_contacts`
- `tenant_isolation ON patient_identifiers`
- `tenant_isolation ON patients`
- `tenant_isolation ON payment_proofs`
- `tenant_isolation ON payment_provider_sessions`
- `tenant_isolation ON payment_settings`
- `tenant_isolation ON pos_transactions`
- `tenant_isolation ON prescription_items`
- `tenant_isolation ON prescriptions`
- `tenant_isolation ON product_attribute_assignments`
- `tenant_isolation ON product_attributes`
- `tenant_isolation ON product_categories`
- `tenant_isolation ON promotion_products`
- `tenant_isolation ON purchase_order_items`
- `tenant_isolation ON repair_approvals`
- `tenant_isolation ON repair_device_identifiers`
- `tenant_isolation ON repair_devices`
- `tenant_isolation ON repair_diagnostics`
- `tenant_isolation ON repair_order_parts`
- `tenant_isolation ON repair_orders`
- `tenant_isolation ON repair_warranties`
- `tenant_isolation ON salary_payments`
- `tenant_isolation ON sale_items`
- `tenant_isolation ON sales`
- `tenant_isolation ON service_appointments`
- `tenant_isolation ON service_catalog`
- `tenant_isolation ON service_categories`
- `tenant_isolation ON service_order_assignments`
- `tenant_isolation ON service_order_attachments`
- `tenant_isolation ON service_order_billings`
- `tenant_isolation ON service_order_items`
- `tenant_isolation ON service_order_notes`
- `tenant_isolation ON service_order_status_history`
- `tenant_isolation ON service_orders`
- `tenant_isolation ON service_prices`
- `tenant_isolation ON shop_customers`
- `tenant_isolation ON staff_contracts`
- `tenant_isolation ON stock_item_identifier_rules`
- `tenant_isolation ON stock_items`
- `tenant_isolation ON supplier_invoice_items`
- `tenant_isolation ON supplier_invoices`
- `tenant_isolation ON supplier_payments`
- `tenant_isolation ON supplier_return_items`
- `tenant_isolation ON supplier_returns`
- `tenant_isolation ON support_tickets`
- `tenant_isolation ON sync_changes`
- `tenant_isolation ON sync_checkpoints`
- `tenant_isolation ON sync_conflicts`
- `tenant_isolation ON sync_devices`
- `tenant_isolation ON sync_entity_versions`
- `tenant_isolation ON sync_logs`
- `tenant_isolation ON sync_operations`
- `tenant_isolation ON sync_sessions`
- `tenant_isolation ON tax_rates`
- `tenant_isolation ON testimonials`
- `tenant_isolation ON treatment_plan_items`
- `tenant_isolation ON treatment_plans`
- `tenant_isolation ON user_roles`
- `tenant_isolation ON users`
- `tenant_isolation ON warehouse_inventory`
- `tenant_isolation ON warehouse_inventory_movements`
- `tenant_isolation ON warehouse_locations`
- `tenant_isolation ON warehouses`
- `tenant_isolation ON workflow_executions`
- `tenant_isolation ON workflow_logs`
- `tenant_isolation ON workflow_rules`
- `tenant_isolation ON workflows`

## Can the new schema support all old business capabilities?

**No. Estimated support: approximately 60%.**

The current schema supports the canonical commerce core well: merchants/shops, authentication memberships, tenant RBAC, customers, products/variants, locations, inventory balances and FIFO costing, purchasing/receipts, canonical orders, POS sessions, payments/refunds, carts/checkout, promotions, returns, journals, audit events, and RLS. It cannot support the full old capability surface because AR/AP, tax and bank/cash subledgers, CRM communications, notifications, workflows, generic files, offline sync, AI, service/repair/clinical domains, and several ecommerce/provider integrations remain absent. This is a weighted business-capability estimate, not a table-count ratio.
