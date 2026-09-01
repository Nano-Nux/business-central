export type Role = {
  id: string;
  code: string;
  name: string;
  permission_codes: string[];
};

export type User = {
  id: string;
  membership_id: string;
  merchant_id: string;
  email: string;
  display_name: string;
  phone?: string;
  shop_id?: string;
  is_active: boolean;
  platform_admin: boolean;
  super_admin?: boolean;
  roles: Role[];
};

export type Session = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
  user: User;
};

export type ApiEnvelope<T> = {
  data: T;
  meta?: {
    page?: number;
    page_index?: number;
    page_size?: number;
    total?: number;
    total_pages?: number;
  };
};

export type Product = {
  id: string;
  name: string;
  barcode?: string;
  description?: string;
  product_type: string;
  is_active: boolean;
  manufacture_date?: string;
  expired_date?: string;
  brand_id?: string;
  category_ids: string[];
  category_names: string[];
  images?: CatalogImage[];
  sync_version?: number;
};

export type CatalogImage = {
  id: string;
  product_id?: string;
  variant_id?: string;
  image_url: string;
  source_type: "URL" | "GOOGLE_DRIVE" | "UPLOAD";
  alt_text?: string;
  position: number;
};

export type StorageItem = {
  id: string;
  catalog: string;
  product_name: string;
  variant_name: string;
  brand?: string;
  unit: string;
  stock_count: string;
  sell_price?: string;
  original_price?: string;
  profit?: string;
  expired_date?: string;
  manufacture_date?: string;
};

export type Category = {
  id: string;
  parent_category_id?: string;
  name: string;
  slug?: string | null;
  description?: string;
  image_url?: string;
  sort_order: number;
  sync_version?: number;
};

export type Brand = {
  id: string;
  merchant_id: string;
  name: string;
  slug?: string | null;
  description?: string;
  image_url?: string;
  is_active: boolean;
};

export type Variant = {
  id: string;
  product_id: string;
  sku: string;
  barcode?: string;
  name: string;
  base_unit_id: string;
  unit_of_measure: string;
  is_stock_tracked: boolean;
  attributes?: Record<string, unknown>;
  images?: CatalogImage[];
  sync_version?: number;
  product_name?: string;
  quantity_on_hand?: string;
  price?: string;
};

export type AttributeOption = {
  id: string;
  merchant_id?: string;
  definition_id: string;
  value: string;
  label: string;
  position: number;
  sync_version?: number;
};

export type AttributeDefinition = {
  id: string;
  merchant_id?: string;
  code: string;
  name: string;
  value_type: "TEXT" | "NUMBER" | "BOOLEAN" | "SELECT" | "DATE" | "JSON";
  options: AttributeOption[];
  sync_version?: number;
};

export type Unit = {
  id: string;
  merchant_id?: string;
  code: string;
  name: string;
  symbol?: string;
  dimension_code: string;
  allows_decimal: boolean;
  is_active: boolean;
  sync_version?: number;
};

export type Conversion = {
  id: string;
  merchant_id?: string;
  from_unit_id: string;
  to_unit_id: string;
  multiplier: string;
  additive_offset: string;
  is_active: boolean;
  sync_version?: number;
};

export type Shop = {
  id: string;
  business_type_id?: string;
  business_type_name?: string;
  name: string;
  code: string;
  address?: Record<string, string>;
  timezone?: string;
  is_active: boolean;
  module_codes: string[];
  include_tax: boolean;
  tax_rate: string;
  logo_url?: string;
  logo_source_type?: string;
  show_logo_in_printed_invoice?: boolean;
  show_device_completion_status?: boolean;
  show_device_type_in_repair_invoice?: boolean;
  show_device_brand_in_repair_invoice?: boolean;
  contact_info?: string;
  footer_note?: string;
  tax_label?: string;
  receipt_note?: string;
};
export type Location = {
  id: string;
  shop_id?: string;
  code: string;
  name: string;
  location_type: string;
  is_active: boolean;
};
export type Merchant = {
  id: string;
  name: string;
  slug: string;
  legal_name?: string;
  default_currency_code: string;
  country_code?: string;
  pos_complexity_level: "SIMPLE" | "COMPLEX";
  is_active: boolean;
};
export type Currency = {
  code: string;
  name: string;
  symbol?: string;
  decimal_places: number;
};
export type PaymentTypeCategory = {
  code: "CASH" | "ONLINE" | "DIGITAL";
  name: string;
  is_available: boolean;
};
export type PaymentType = {
  id: string;
  merchant_id: string;
  category_code: PaymentTypeCategory["code"];
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type PriceList = {
  id: string;
  code: string;
  currency_code: string;
  is_default: boolean;
  sync_version?: number;
};
export type ProductPrice = {
  sync_id?: string;
  sync_version?: number;
  price_list_id: string;
  variant_id: string;
  amount: string;
  valid_from: string;
  valid_until?: string;
};

export type Promotion = {
  id: string;
  name: string;
  promotion_type: string;
  value: string;
  minimum_subtotal: string;
  usage_limit?: number;
  redemption_count: number;
  starts_at?: string;
  ends_at?: string;
  is_active: boolean;
};

export type Movement = {
  id: string;
  variant_id: string;
  movement_type: string;
  source_location_id?: string;
  destination_location_id?: string;
  unit_id?: string;
  quantity: string;
  entered_quantity?: string;
  order_line_id?: string;
  receipt_line_id?: string;
  reverses_movement_id?: string;
  unit_cost?: string;
  event_key: string;
  occurred_at: string;
  created_at?: string;
};

export type StockAsset = {
  id: string;
  merchant_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  location_id?: string;
  location_name?: string;
  asset_tag: string;
  status: string;
  barcode_id?: string;
  barcode?: string;
};

export type StockMovementDetail = {
  movement: Movement;
  product_name: string;
  product_description?: string;
  variant_name: string;
  sku: string;
  barcode?: string;
  unit_name?: string;
  unit_symbol?: string;
  source_location_name?: string;
  source_location_code?: string;
  destination_location_name?: string;
  destination_location_code?: string;
  total_cost: string;
  source_quantity_on_hand?: string;
  source_quantity_reserved?: string;
  destination_quantity_on_hand?: string;
  destination_quantity_reserved?: string;
  receipt?: {
    receipt_id: string;
    receipt_number: string;
    received_at: string;
    purchase_order_id: string;
    purchase_order_number: string;
    purchase_order_status: string;
    supplier_name: string;
    currency_code: string;
    batch_number?: string;
    expires_at?: string;
    quantity_received: string;
    unit_cost: string;
  };
  order?: {
    order_id: string;
    order_number: string;
    channel: string;
    status: string;
    currency_code: string;
    customer_name?: string;
    customer_phone?: string;
    line_id: string;
    description: string;
    ordered_quantity: string;
    unit_price: string;
    discount_amount: string;
    tax_amount: string;
    line_total: string;
  };
  cost_allocations: Array<{
    id: string;
    cost_layer_id: string;
    quantity: string;
    unit_cost: string;
    total_cost: string;
    layer_quantity_received: string;
    layer_quantity_remaining: string;
    source_receipt_number?: string;
  }>;
};

export type TransactionHistoryEntry = {
  id: string;
  event_type: string;
  reference: string;
  occurred_at: string;
  status: string;
  channel?: string;
  customer_name?: string;
  customer_phone?: string;
  payment_method?: string;
  amount?: string;
  currency_code?: string;
  shop_id?: string;
  shop_name?: string;
  quantity?: string;
  product_name?: string;
  variant_name?: string;
  sku?: string;
  details?: string;
};

export type TransactionHistoryDetail = {
  entry: TransactionHistoryEntry;
  order?: {
    id: string;
    order_number: string;
    channel: string;
    status: string;
    currency_code: string;
    subtotal: string;
    discount_total: string;
    tax_total: string;
    shipping_total: string;
    grand_total: string;
    customer_name?: string;
    customer_phone?: string;
    shop_name?: string;
    delivery_name?: string;
    delivery_contact?: string;
    note?: string;
    payment_type?: string;
    created_at: string;
    placed_at?: string;
  };
  lines: Array<{
    id: string;
    description: string;
    product_name?: string;
    variant_name?: string;
    sku?: string;
    quantity: string;
    unit_price: string;
    original_unit_cost: string;
    original_cost: string;
    cost_posted: boolean;
    discount_amount: string;
    tax_amount: string;
    line_total: string;
    gross_profit: string;
    gross_margin: string;
  }>;
  payments: Array<{
    id: string;
    method: string;
    status: string;
    amount: string;
    captured_at?: string;
    created_at: string;
  }>;
  refunds: Array<{
    id: string;
    payment_id: string;
    status: string;
    amount: string;
    reason?: string;
    created_at: string;
  }>;
  total_cost: string;
  gross_profit: string;
  gross_margin: string;
};

export type RepairOrder = {
  id: string;
  service_order_id: string;
  shop_id?: string;
  device_id: string;
  order_number: string;
  status: string;
  issue_description: string;
  received_at: string;
  completed_at?: string;
  waiting_start_date?: string;
  waiting_end_date?: string;
  waiting_days?: number;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  subtotal?: string;
  discount_total?: string;
  deposit_paid: string;
  payment_status: "UNPAID" | "DEPOSIT_PAID" | "AMOUNT_PAID" | "PAID" | string;
  service_id?: string;
  promotion_id?: string;
  labor_fee: string;
  additional_fee: string;
  tax_amount: string;
  total_cost: string;
  note?: string;
  work_items?: RepairWorkItem[];
  fields?: Record<string, unknown>;
  form_version?: number;
};

export type RepairDevice = {
  id: string;
  merchant_id?: string;
  customer_id?: string;
  device_type: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  metadata?: Record<string, unknown>;
};

export type RepairWorkItem = {
  id: string;
  service_order_id: string;
  sequence_number: number;
  type: string;
  status: string;
  form_version?: number;
  summary?: string;
  device: RepairDevice;
  issue_description: string;
  issues?: string[];
  conditions?: string[];
  note?: string;
  additional_fee?: string;
  waiting_start_date?: string;
  waiting_end_date?: string;
  waiting_days?: number;
  financials?: {
    subtotal: string;
    discount_total: string;
    tax_amount: string;
    total: string;
    paid: string;
    balance: string;
  };
  fields?: Record<string, unknown>;
};

export type RepairPreset = {
  id: string;
  merchant_id: string;
  shop_id: string;
  preset_type: "ISSUE" | "CONDITION";
  value: string;
  created_at: string;
  updated_at: string;
};

export type CustomFieldDefinition = {
  id: string;
  entity_type: string;
  module_code: string;
  service_type?: string;
  field_scope: "TICKET" | "WORK_ITEM" | string;
  field_code: string;
  label: string;
  value_type: "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "SELECT" | "JSON" | string;
  is_required: boolean;
  options?: unknown[];
  validation_rules?: Record<string, unknown>;
  visibility_rules?: Record<string, unknown>;
  display_order: number;
  section?: string;
  printable: boolean;
  form_version: number;
  is_active: boolean;
};

export type RepairPayment = {
  id: string;
  repair_order_id: string;
  kind: string;
  method: string;
  payment_type_id?: string;
  category_code?: PaymentTypeCategory["code"];
  status: string;
  amount: string;
  created_at: string;
  allocations?: Array<{ work_item_id: string; amount: string }>;
};
export type RepairApproval = {
  id: string;
  repair_order_id: string;
  work_item_id?: string;
  approval_version: number;
  status: string;
  approved_amount?: string;
  approved_at?: string;
  created_at: string;
};
export type RepairWarranty = {
  id: string;
  repair_order_id: string;
  work_item_id?: string;
  starts_at: string;
  ends_at: string;
  terms?: string;
};
export type RepairImage = {
  id: string;
  repair_order_id: string;
  work_item_id?: string;
  filename: string;
  content_type: string;
  image_url?: string;
  source_type: "URL" | "GOOGLE_DRIVE" | "UPLOAD" | "LEGACY_BASE64";
  data_base64?: string;
  created_at: string;
};

export type Invoice = {
  id: string;
  number: string;
  customer: string;
  merchantName?: string;
  currencyCode: string;
  shopName?: string;
  shopTimezone?: string;
  shopId?: string;
  shop_id?: string;
  customer_phone?: string;
  createdAt: string;
  status: "Paid" | "Pending" | "Refunded";
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  items: Array<{ name: string; quantity: number; price: number; work_item_id?: string }>;
  work_items?: Array<{
    id: string;
    sequence_number: number;
    type: string;
    status: string;
    form_version: number;
    device_type: string;
    manufacturer?: string;
    model?: string;
    serial_number?: string;
    issue_description: string;
    issues?: string[];
    conditions?: string[];
    note?: string;
    fields?: Record<string, unknown>;
    additional_fee?: string;
    waiting_start_date?: string;
    waiting_end_date?: string;
    waiting_days?: number;
    subtotal?: string;
    discount_total?: string;
    tax_amount?: string;
    total?: string;
    paid?: string;
    balance?: string;
  }>;
  ticket_fields?: Record<string, unknown>;
  shopAddress?: string;
  shopContact?: string;
  logoUrl?: string;
  showLogo?: boolean;
  showDeviceCompletionStatus?: boolean;
  showDeviceType?: boolean;
  showDeviceBrand?: boolean;
  waitingStartDate?: string;
  waitingEndDate?: string;
  waitingDays?: number;
  kind?: "pos" | "repair";
  ticketStatus?: string;
  paymentStatus?: string;
  amountPaid?: number;
  balanceDue?: number;
  modelNumber?: string;
  errorDescription?: string;
  imeiNumber?: string;
  shopNote?: string;
  customerPhone?: string;
  deliveryName?: string;
  deliveryFee?: number;
  deliveryContact?: string;
  note?: string;
  paymentType?: string;
  footerNote?: string;
  taxLabel?: string;
  receiptNote?: string;
};

export type Delivery = {
  id: string;
  shop_id: string;
  name: string;
  contact_info: string;
  sync_version?: number;
};

export type Customer = {
  id: string;
  merchant_id: string;
  customer_number: string;
  customer_type: "RETAIL" | "WHOLESALE" | "GUEST";
  display_name: string;
  email?: string;
  phone?: string;
  loyalty_identifier?: string;
  metadata: Record<string, unknown>;
  order_count: number;
  repair_count: number;
  created_at: string;
  updated_at: string;
};
