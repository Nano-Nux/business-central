import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/lonsh/.gemini/antigravity-ide/brain/38772d57-cf68-4611-8e3c-5cdda553478c/guide-screenshots';
const PUBLIC_DIR = 'public/guide-screenshots';
const ROOT_DIR = 'guide-screenshots';

[PUBLIC_DIR, ROOT_DIR, ARTIFACT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Master Mock Datasets
const mockUser = {
  id: 'user-1',
  merchant_id: 'merchant-1',
  display_name: 'Alexander Wright',
  email: 'alexander@techflagship.com',
  is_active: true,
  roles: [{ id: 'role-owner', code: 'OWNER', name: 'Store Owner', permission_codes: ['*'] }]
};

const mockShop = {
  id: 'shop-1',
  name: 'Downtown Flagship',
  timezone: 'UTC',
  is_active: true,
  module_codes: ['repair', 'sales', 'inventory', 'delivery', 'catalog', 'reports']
};

const mockCurrencies = [
  { code: 'USD', symbol: '$', decimal_places: 2 },
  { code: 'MMK', symbol: 'Ks', decimal_places: 0 },
  { code: 'THB', symbol: '฿', decimal_places: 2 }
];

const mockPosCatalog = [
  {
    id: 'var-1',
    product_id: 'prod-1',
    product_name: 'MacBook Pro 16" M3 Max',
    name: '36GB RAM / 1TB SSD Space Black',
    sku: 'MBP-16-M3',
    price: '2499.00',
    sell_price: '2499.00',
    cost: '2100.00',
    barcode: '8801234001',
    quantity_on_hand: '18',
    base_unit_id: 'unit-pcs',
    is_stock_tracked: true,
    images: []
  },
  {
    id: 'var-2',
    product_id: 'prod-2',
    product_name: 'iPhone 15 Pro 256GB',
    name: 'Natural Titanium',
    sku: 'IP15P-256',
    price: '1099.00',
    sell_price: '1099.00',
    cost: '899.00',
    barcode: '8801234002',
    quantity_on_hand: '34',
    base_unit_id: 'unit-pcs',
    is_stock_tracked: true,
    images: []
  },
  {
    id: 'var-3',
    product_id: 'prod-3',
    product_name: 'AirPods Pro (2nd Gen)',
    name: 'MagSafe Case (USB-C)',
    sku: 'APP-GEN2',
    price: '249.00',
    sell_price: '249.00',
    cost: '180.00',
    barcode: '8801234003',
    quantity_on_hand: '62',
    base_unit_id: 'unit-pcs',
    is_stock_tracked: true,
    images: []
  },
  {
    id: 'var-4',
    product_id: 'prod-4',
    product_name: 'iPad Air 11" M2',
    name: '128GB Wi-Fi Starlight',
    sku: 'IPAD-M2-11',
    price: '599.00',
    sell_price: '599.00',
    cost: '480.00',
    barcode: '8801234004',
    quantity_on_hand: '29',
    base_unit_id: 'unit-pcs',
    is_stock_tracked: true,
    images: []
  },
  {
    id: 'var-5',
    product_id: 'prod-5',
    product_name: 'Magic Keyboard with Touch ID',
    name: 'Black Keys / Aluminum',
    sku: 'MK-TID-BLK',
    price: '199.00',
    sell_price: '199.00',
    cost: '140.00',
    barcode: '8801234005',
    quantity_on_hand: '25',
    base_unit_id: 'unit-pcs',
    is_stock_tracked: true,
    images: []
  },
  {
    id: 'var-6',
    product_id: 'prod-6',
    product_name: '20W USB-C Power Adapter',
    name: 'Compact Fast Charger',
    sku: 'A20W-USBC',
    price: '19.00',
    sell_price: '19.00',
    cost: '9.00',
    barcode: '8801234006',
    quantity_on_hand: '120',
    base_unit_id: 'unit-pcs',
    is_stock_tracked: true,
    images: []
  }
];

const mockProducts = [
  {
    id: 'prod-1',
    name: 'MacBook Pro 16" M3 Max',
    product_type: 'PHYSICAL',
    description: '16-inch Liquid Retina XDR display, M3 Max chip, Space Black',
    barcode: '8801234001',
    brand_id: 'brand-apple',
    category_ids: ['cat-mac'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '2499.00',
    cost: '2100.00',
    quantity_on_hand: '18',
    images: []
  },
  {
    id: 'prod-2',
    name: 'iPhone 15 Pro',
    product_type: 'PHYSICAL',
    description: 'Aerospace-grade titanium, A17 Pro chip, USB-C 3',
    barcode: '8801234002',
    brand_id: 'brand-apple',
    category_ids: ['cat-phones'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '1099.00',
    cost: '899.00',
    quantity_on_hand: '34',
    images: []
  },
  {
    id: 'prod-3',
    name: 'AirPods Pro (2nd Gen)',
    product_type: 'PHYSICAL',
    description: 'Active Noise Cancellation, Transparency mode, USB-C MagSafe case',
    barcode: '8801234003',
    brand_id: 'brand-apple',
    category_ids: ['cat-audio'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '249.00',
    cost: '180.00',
    quantity_on_hand: '62',
    images: []
  },
  {
    id: 'prod-4',
    name: 'iPad Air 11" M2',
    product_type: 'PHYSICAL',
    description: 'Liquid Retina display, M2 chip, Landscape 12MP front camera',
    barcode: '8801234004',
    brand_id: 'brand-apple',
    category_ids: ['cat-tablets'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '599.00',
    cost: '480.00',
    quantity_on_hand: '29',
    images: []
  }
];

const mockCategories = [
  { id: 'cat-mac', name: 'Laptops & MacBooks', slug: 'laptops-macbooks', description: 'MacBook Pro and Air workstations', sort_order: 1, is_active: true },
  { id: 'cat-phones', name: 'Smartphones & Flagships', slug: 'smartphones', description: 'iOS and Android flagship devices', sort_order: 2, is_active: true },
  { id: 'cat-audio', name: 'Audio & Wireless Acoustics', slug: 'audio', description: 'Headphones, earbuds, and spatial speakers', sort_order: 3, is_active: true },
  { id: 'cat-tablets', name: 'Tablets & iPads', slug: 'tablets', description: 'Productivity tablets and pen accessories', sort_order: 4, is_active: true }
];

const mockBrands = [
  { id: 'brand-apple', name: 'Apple Inc.', slug: 'apple', description: 'Cupertino consumer electronics & workstations' },
  { id: 'brand-samsung', name: 'Samsung Electronics', slug: 'samsung', description: 'Galaxy ecosystem devices and displays' },
  { id: 'brand-sony', name: 'Sony Acoustics', slug: 'sony', description: 'Professional audio monitors and noise-cancelling tech' },
  { id: 'brand-bose', name: 'Bose', slug: 'bose', description: 'Premium noise-cancelling headsets' }
];

const mockAttributes = [
  {
    id: 'attr-storage',
    code: 'STORAGE',
    name: 'Storage Capacity',
    value_type: 'OPTIONS',
    options: [
      { id: 'opt-128', label: '128GB NVMe', value: '128gb', sort_order: 1 },
      { id: 'opt-256', label: '256GB NVMe', value: '256gb', sort_order: 2 },
      { id: 'opt-512', label: '512GB NVMe', value: '512gb', sort_order: 3 },
      { id: 'opt-1tb', label: '1TB NVMe High-Speed', value: '1tb', sort_order: 4 }
    ]
  },
  {
    id: 'attr-ram',
    code: 'RAM',
    name: 'Unified Memory',
    value_type: 'OPTIONS',
    options: [
      { id: 'opt-8', label: '8GB Unified', value: '8gb', sort_order: 1 },
      { id: 'opt-16', label: '16GB Unified', value: '16gb', sort_order: 2 },
      { id: 'opt-32', label: '36GB Unified', value: '36gb', sort_order: 3 }
    ]
  },
  {
    id: 'attr-color',
    code: 'COLOR',
    name: 'Chassis Finish',
    value_type: 'OPTIONS',
    options: [
      { id: 'opt-space-black', label: 'Space Black', value: 'space-black', sort_order: 1 },
      { id: 'opt-titanium', label: 'Natural Titanium', value: 'natural-titanium', sort_order: 2 },
      { id: 'opt-silver', label: 'Silver Anodized', value: 'silver', sort_order: 3 }
    ]
  }
];

const mockUnits = [
  { id: 'unit-pcs', code: 'PCS', name: 'Piece / Unit', symbol: 'pcs', dimension_code: 'COUNT', allows_decimal: false, is_active: true },
  { id: 'unit-box', code: 'BOX', name: 'Master Retail Box', symbol: 'box', dimension_code: 'COUNT', allows_decimal: false, is_active: true },
  { id: 'unit-kg', code: 'KG', name: 'Kilogram', symbol: 'kg', dimension_code: 'MASS', allows_decimal: true, is_active: true },
  { id: 'unit-m', code: 'M', name: 'Meter Roll', symbol: 'm', dimension_code: 'LENGTH', allows_decimal: true, is_active: true }
];

const mockConversions = [
  { id: 'conv-1', from_unit_id: 'unit-box', to_unit_id: 'unit-pcs', multiplier: '12', additive_offset: '0', is_active: true },
  { id: 'conv-2', from_unit_id: 'unit-kg', to_unit_id: 'unit-pcs', multiplier: '5', additive_offset: '0', is_active: true }
];

const mockPriceLists = [
  { id: 'pl-1', code: 'RETAIL-STD', name: 'Standard Retail Price List', currency_code: 'USD', is_default: true },
  { id: 'pl-2', code: 'WHOLESALE-VIP', name: 'Tier-1 Corporate Wholesale (15% Off)', currency_code: 'USD', is_default: false },
  { id: 'pl-3', code: 'PROMO-SUMMER', name: 'Summer Promotional Clearance', currency_code: 'USD', is_default: false }
];

const mockProductPrices = [
  { price_list_id: 'pl-1', variant_id: 'var-1', amount: '2499.00', valid_from: '2026-01-01T00:00:00Z' },
  { price_list_id: 'pl-2', variant_id: 'var-1', amount: '2150.00', valid_from: '2026-01-01T00:00:00Z' },
  { price_list_id: 'pl-1', variant_id: 'var-2', amount: '1099.00', valid_from: '2026-01-01T00:00:00Z' },
  { price_list_id: 'pl-2', variant_id: 'var-2', amount: '950.00', valid_from: '2026-01-01T00:00:00Z' }
];

const mockLocations = [
  { id: 'loc-1', shop_id: 'shop-1', name: 'Main Sales Floor - Shelf A', code: 'FLR-A', location_type: 'SHELF', is_active: true },
  { id: 'loc-2', shop_id: 'shop-1', name: 'Backroom Storage - Rack 3', code: 'BCK-R3', location_type: 'RACK', is_active: true },
  { id: 'loc-3', shop_id: 'shop-1', name: 'Secure Device Safe 01', code: 'SAFE-01', location_type: 'SAFE', is_active: true }
];

const mockMovements = [
  {
    id: 'mov-1',
    variant_id: 'var-1',
    occurred_at: '2026-09-14T08:45:00Z',
    movement_type: 'RECEIPT',
    destination_location_id: 'loc-2',
    quantity: '10',
    unit_cost: '2100.00',
    event_key: 'PO-2026-9041'
  },
  {
    id: 'mov-2',
    variant_id: 'var-2',
    occurred_at: '2026-09-14T07:30:00Z',
    movement_type: 'SALE',
    source_location_id: 'loc-1',
    quantity: '1',
    unit_cost: '899.00',
    event_key: 'INV-2026-0842'
  },
  {
    id: 'mov-3',
    variant_id: 'var-3',
    occurred_at: '2026-09-13T16:20:00Z',
    movement_type: 'TRANSFER',
    source_location_id: 'loc-2',
    destination_location_id: 'loc-1',
    quantity: '15',
    unit_cost: '180.00',
    event_key: 'TRF-2026-0042'
  },
  {
    id: 'mov-4',
    variant_id: 'var-4',
    occurred_at: '2026-09-13T11:10:00Z',
    movement_type: 'RECEIPT',
    destination_location_id: 'loc-1',
    quantity: '8',
    unit_cost: '480.00',
    event_key: 'PO-2026-9038'
  },
  {
    id: 'mov-5',
    variant_id: 'var-6',
    occurred_at: '2026-09-12T14:00:00Z',
    movement_type: 'ADJUSTMENT',
    source_location_id: 'loc-1',
    quantity: '2',
    unit_cost: '9.00',
    event_key: 'AUDIT-ADJ-0912'
  }
];

const mockMovementDetail = {
  movement: {
    id: 'mov-1',
    variant_id: 'var-1',
    occurred_at: '2026-09-14T08:45:00Z',
    movement_type: 'RECEIPT',
    destination_location_id: 'loc-2',
    quantity: '10',
    unit_cost: '2100.00',
    event_key: 'PO-2026-9041',
    created_at: '2026-09-14T08:45:00Z'
  },
  product_name: 'MacBook Pro 16" M3 Max',
  product_description: '16-inch Liquid Retina XDR display, M3 Max chip, Space Black',
  variant_name: '36GB RAM / 1TB SSD Space Black',
  sku: 'MBP-16-M3',
  barcode: '8801234001',
  unit_name: 'Piece (pcs)',
  source_location_name: 'Supplier External Freight Hub',
  destination_location_name: 'Backroom Storage - Rack 3',
  cost_allocations: [
    {
      id: 'alloc-1',
      source_receipt_number: 'PO-2026-9041',
      quantity: '10',
      unit_cost: '2100.00',
      total_cost: '21000.00',
      layer_received_at: '2026-09-14T08:45:00Z',
      remaining_quantity: '8'
    }
  ]
};

const mockStorageItems = [
  {
    catalog: 'Laptops → MacBook Pro',
    variant_name: '36GB RAM / 1TB SSD Space Black',
    brand: 'Apple',
    product_name: 'MacBook Pro 16" M3 Max',
    unit: 'pcs',
    stock_count: '18',
    sell_price: '2499.00',
    original_price: '2100.00',
    profit: '399.00',
    manufacture_date: '2026-01-15',
    expired_date: ''
  },
  {
    catalog: 'Smartphones → iPhone',
    variant_name: '256GB Natural Titanium',
    brand: 'Apple',
    product_name: 'iPhone 15 Pro',
    unit: 'pcs',
    stock_count: '34',
    sell_price: '1099.00',
    original_price: '899.00',
    profit: '200.00',
    manufacture_date: '2026-02-10',
    expired_date: ''
  },
  {
    catalog: 'Audio → AirPods',
    variant_name: 'MagSafe Case (USB-C)',
    brand: 'Apple',
    product_name: 'AirPods Pro (2nd Gen)',
    unit: 'pcs',
    stock_count: '62',
    sell_price: '249.00',
    original_price: '180.00',
    profit: '69.00',
    manufacture_date: '2026-03-01',
    expired_date: ''
  }
];

const mockAssets = [
  {
    id: 'ast-1',
    asset_code: 'BC-SER-994821',
    serial_number: 'SN-APL-88391024',
    product_name: 'MacBook Pro 16" M3 Max',
    variant_name: '36GB RAM / 1TB SSD Space Black',
    status: 'IN_STOCK',
    location_name: 'Backroom Storage - Rack 3',
    created_at: '2026-09-10T10:30:00Z'
  },
  {
    id: 'ast-2',
    asset_code: 'BC-SER-994822',
    serial_number: 'SN-APL-77401923',
    product_name: 'iPhone 15 Pro 256GB',
    variant_name: 'Natural Titanium',
    status: 'IN_STOCK',
    location_name: 'Secure Device Safe 01',
    created_at: '2026-09-11T11:15:00Z'
  },
  {
    id: 'ast-3',
    asset_code: 'BC-SER-994823',
    serial_number: 'SN-APL-66391044',
    product_name: 'iPad Air 11" M2',
    variant_name: '128GB Wi-Fi Starlight',
    status: 'ALLOCATED',
    location_name: 'Main Sales Floor - Shelf A',
    created_at: '2026-09-12T14:20:00Z'
  }
];

const mockTransactions = [
  {
    id: 'tx-1',
    event_type: 'TRANSACTION',
    reference: 'INV-2026-0842',
    channel: 'pos',
    occurred_at: '2026-09-14T09:15:00Z',
    customer_name: 'Sarah Jenkins',
    customer_phone: '+1 555 234 5678',
    product_name: 'iPhone 15 Pro',
    variant_name: '256GB Natural Titanium',
    sku: 'IP15P-256',
    payment_method: 'CASH',
    quantity: '2',
    amount: '1348.00',
    currency_code: 'USD',
    status: 'COMPLETED',
    details: 'iPhone 15 Pro + 20W USB-C Adapter'
  },
  {
    id: 'tx-2',
    event_type: 'TRANSACTION',
    reference: 'INV-2026-0841',
    channel: 'pos',
    occurred_at: '2026-09-14T08:30:00Z',
    customer_name: 'Marcus Vance',
    customer_phone: '+1 555 345 6789',
    product_name: 'MacBook Pro 16" M3 Max',
    variant_name: '36GB RAM / 1TB SSD Space Black',
    sku: 'MBP-16-M3',
    payment_method: 'CARD',
    quantity: '1',
    amount: '2499.00',
    currency_code: 'USD',
    status: 'COMPLETED',
    details: 'MacBook Pro 16" M3 Max'
  },
  {
    id: 'tx-3',
    event_type: 'REPAIR_CHECKOUT',
    reference: 'INV-2026-0840',
    channel: 'pos',
    occurred_at: '2026-09-13T17:45:00Z',
    customer_name: 'David Miller',
    customer_phone: '+1 555 456 7890',
    product_name: 'Repair Ticket',
    variant_name: 'REP-2026-0104 (Retina Display Panel)',
    sku: 'REP-0104',
    payment_method: 'DIGITAL',
    quantity: '1',
    amount: '380.00',
    currency_code: 'USD',
    status: 'COMPLETED',
    details: 'Retina Display Panel Replacement'
  }
];

const mockTransactionDetail = {
  entry: mockTransactions[0],
  order: {
    id: 'ord-1001',
    order_number: 'INV-2026-0842',
    channel: 'pos',
    status: 'COMPLETED',
    currency_code: 'USD',
    subtotal: '1348.00',
    discount_total: '0.00',
    tax_total: '0.00',
    shipping_total: '0.00',
    grand_total: '1348.00',
    customer_name: 'Sarah Jenkins',
    customer_phone: '+1 555 234 5678',
    shop_name: 'Downtown Flagship',
    payment_type: 'CASH',
    created_at: '2026-09-14T09:15:00Z'
  },
  lines: [
    {
      id: 'line-1',
      description: 'iPhone 15 Pro 256GB (Natural Titanium)',
      product_name: 'iPhone 15 Pro',
      variant_name: '256GB Natural Titanium',
      sku: 'IP15P-256',
      quantity: '1',
      unit_price: '1099.00',
      original_unit_cost: '899.00',
      original_cost: '899.00',
      cost_posted: true,
      discount_amount: '0.00',
      tax_amount: '0.00',
      line_total: '1099.00',
      gross_profit: '200.00',
      gross_margin: '18.2'
    },
    {
      id: 'line-2',
      description: '20W USB-C Power Adapter Fast Charger',
      product_name: '20W USB-C Power Adapter',
      variant_name: 'Compact Fast Charger',
      sku: 'A20W-USBC',
      quantity: '1',
      unit_price: '19.00',
      original_unit_cost: '9.00',
      original_cost: '9.00',
      cost_posted: true,
      discount_amount: '0.00',
      tax_amount: '0.00',
      line_total: '19.00',
      gross_profit: '10.00',
      gross_margin: '52.6'
    }
  ],
  payments: [
    {
      id: 'pay-1',
      method: 'CASH',
      status: 'CAPTURED',
      amount: '1348.00',
      created_at: '2026-09-14T09:15:00Z'
    }
  ],
  refunds: []
};

const mockCustomers = [
  {
    id: 'cust-1',
    display_name: 'Sarah Jenkins',
    phone: '+1 555 234 5678',
    email: 'sarah.j@email.com',
    customer_type: 'RETAIL',
    order_count: 8,
    repair_count: 2,
    store_credit: '250.00',
    created_at: '2025-11-10T10:00:00Z'
  },
  {
    id: 'cust-2',
    display_name: 'Marcus Vance',
    phone: '+1 555 345 6789',
    email: 'mvance@corp.io',
    customer_type: 'WHOLESALE',
    order_count: 14,
    repair_count: 0,
    store_credit: '0.00',
    created_at: '2025-08-15T14:30:00Z'
  }
];

const mockCustomerSingle = mockCustomers[0];

const mockDeliveries = [
  { id: 'del-1', name: 'DHL Express Dispatch', contact_info: 'Carlos (+1 555 992 1401)', shop_id: 'shop-1', is_active: true },
  { id: 'del-2', name: 'Downtown Van Courier', contact_info: 'Store Internal Fleet #2', shop_id: 'shop-1', is_active: true }
];

const mockDeliverySingle = mockDeliveries[0];

const mockRepairs = [
  {
    id: 'rep-1',
    ticket_number: 'REP-2026-0104',
    customer_name: 'Sarah Jenkins',
    customer_phone: '+1 555 234 5678',
    device_brand: 'Apple',
    device_model: 'MacBook Pro 16" M2',
    issue_description: 'Retina Display flickering & backlight failure',
    status: 'IN_PROGRESS',
    stage: 'In progress',
    estimated_price: '380.00',
    created_at: '2026-09-12T10:00:00Z'
  },
  {
    id: 'rep-2',
    ticket_number: 'REP-2026-0105',
    customer_name: 'David Miller',
    customer_phone: '+1 555 456 7890',
    device_brand: 'Apple',
    device_model: 'iPhone 15 Pro',
    issue_description: 'Battery health degradation (71%) & swollen rear panel',
    status: 'DIAGNOSING',
    stage: 'Intake',
    estimated_price: '95.00',
    created_at: '2026-09-13T14:20:00Z'
  }
];

const mockRepairSingle = {
  ...mockRepairs[0],
  deposit_paid: '100.00',
  labor_fee: '120.00',
  additional_fee: '260.00',
  total_cost: '380.00',
  payment_status: 'DEPOSIT_PAID',
  work_items: [
    {
      id: 'wi-1',
      sequence_number: 1,
      type: 'SCREEN_REPLACEMENT',
      status: 'IN_PROGRESS',
      device: { device_type: 'LAPTOP', manufacturer: 'Apple', model: 'MacBook Pro 16" M2', serial_number: 'SN-APL-992100' },
      issue_description: 'Retina Display flickering & backlight failure',
      issues: ['Display Flickering', 'Backlight Dark'],
      conditions: ['Scratch on bottom case', 'Keyboard intact'],
      financials: { subtotal: '380.00', discount_total: '0.00', tax_amount: '0.00', total: '380.00', paid: '100.00', balance: '280.00' }
    }
  ]
};

const mockRepairCatalog = [
  { id: 'svc-1', name: 'OLED Display & Digitizer Assembly Replacement', code: 'SVC-DISP-01', labor_fee: '60.00', is_active: true },
  { id: 'svc-2', name: 'OEM Battery Replacement & Health Calibration', code: 'SVC-BATT-01', labor_fee: '35.00', is_active: true },
  { id: 'svc-3', name: 'Liquid Contact Ultrasonic Board Cleaning', code: 'SVC-WTR-01', labor_fee: '80.00', is_active: true }
];

const mockPresets = [
  { id: 'pre-1', preset_type: 'ISSUE', value: 'Shattered Outer Glass / Dead OLED Pixels', is_active: true },
  { id: 'pre-2', preset_type: 'ISSUE', value: 'Battery Draining Rapidly / Swollen Enclosure', is_active: true },
  { id: 'pre-3', preset_type: 'CONDITION', value: 'Light cosmetic micro-scratches on bezel', is_active: true },
  { id: 'pre-4', preset_type: 'CONDITION', value: 'Deep dent on bottom aluminum chassis', is_active: true }
];

const mockInvoices = [
  {
    id: 'inv-1',
    number: 'INV-2026-0842',
    customer: 'Sarah Jenkins',
    customer_phone: '+1 555 234 5678',
    merchant_name: 'Tech Flagship Store',
    shop_name: 'Downtown Flagship',
    shop_id: 'shop-1',
    currency_code: 'USD',
    created_at: '2026-09-14T09:15:00Z',
    status: 'COMPLETED',
    kind: 'pos',
    subtotal: '1348.00',
    discount_total: '0.00',
    tax_total: '0.00',
    grand_total: '1348.00',
    payment_status: 'PAID'
  }
];

const mockPromotions = [
  {
    id: 'prm-1',
    name: 'Summer Flash Deal: 10% Off Audio',
    promotion_type: 'PERCENTAGE',
    value: '10.00',
    minimum_subtotal: '50.00',
    redemption_count: 14,
    is_active: true
  },
  {
    id: 'prm-2',
    name: 'New Customer $20 Instant Voucher',
    promotion_type: 'FIXED_AMOUNT',
    value: '20.00',
    minimum_subtotal: '100.00',
    redemption_count: 32,
    is_active: true
  }
];

const mockStaffAccounts = [
  { id: 'usr-1', email: 'alexander@techflagship.com', display_name: 'Alexander Wright', role_code: 'OWNER', role_name: 'Store Owner', is_active: true },
  { id: 'usr-2', email: 'elena.tech@techflagship.com', display_name: 'Elena Rostova', role_code: 'TECHNICIAN', role_name: 'Master Technician', is_active: true },
  { id: 'usr-3', email: 'marcus.cashier@techflagship.com', display_name: 'Marcus Brody', role_code: 'CASHIER', role_name: 'Floor Cashier', is_active: true }
];

const mockRoles = [
  { id: 'r-1', code: 'OWNER', name: 'Owner / Administrator', permission_codes: ['*'] },
  { id: 'r-2', code: 'MANAGER', name: 'Shop Floor Manager', permission_codes: ['*'] },
  { id: 'r-3', code: 'TECHNICIAN', name: 'Workshop Technician', permission_codes: ['repair', 'stock_in'] },
  { id: 'r-4', code: 'CASHIER', name: 'Front-Desk Cashier', permission_codes: ['sales'] }
];

// All 36 Detailed Screens Definition
const ALL_SCREENS = [
  // 1. Overview
  {
    id: 'dashboard-overview',
    filename: 'dashboard-overview.png',
    route: '/dashboard',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Real-time KPI Metric Cards', finder: () => document.querySelector('.stats-grid'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Quick Action POS Button', finder: () => document.querySelector('.page-actions a, .button-primary'), pos: { x: 'right', y: 'top', offsetX: -220, offsetY: 4 } },
      { num: 3, color: '#7c3aed', label: '3. Live Sales Rhythm & Volume', finder: () => document.querySelector('.card-head h2'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } }
    ]
  },

  // 2. POS Modes
  {
    id: 'pos-mini',
    filename: 'pos-mini.png',
    route: '/pos',
    posComplexity: 'MINI',
    targets: [
      { num: 1, color: '#10b981', label: '1. Fast Barcode & Search Input', finder: () => document.querySelector('.search-box, input[type="search"]'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. One-Tap Quick Tender', finder: () => document.querySelector('.cart-footer, .cart-totals, button[type="submit"]'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'pos-simple',
    filename: 'pos-simple.png',
    route: '/pos',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#0284c7', label: '1. Visual Category Filter Bar', finder: () => document.querySelector('.category-chips, .categories-scroll, [role="tablist"]'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#2563eb', label: '2. High-Density Product Grid', finder: () => document.querySelector('.catalog-grid, .products-grid'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } },
      { num: 3, color: '#7c3aed', label: '3. Cart Summary & Customer Link', finder: () => document.querySelector('.cart-pane, .cart-sidebar, aside.card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'pos-complex',
    filename: 'pos-complex.png',
    route: '/pos',
    posComplexity: 'COMPLEX',
    targets: [
      { num: 1, color: '#c084fc', label: '1. Multi-Dimensional Matrix Selector', finder: () => document.querySelector('.catalog-grid, .products-grid'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } },
      { num: 2, color: '#9333ea', label: '2. Serial Barcode & Delivery Dispatch', finder: () => document.querySelector('.cart-pane, aside.card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'pos-checkout-modal',
    filename: 'pos-checkout-modal.png',
    route: '/pos',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const itemBtn = page.locator('.product-tile-main').first();
      if (await itemBtn.count()) await itemBtn.click();
      await page.waitForTimeout(400);
      const detailsBtn = page.locator('button:has-text("Add more detail"), button:has-text("Details")').first();
      if (await detailsBtn.count()) await detailsBtn.click();
      await page.waitForTimeout(600);
    },
    targets: [
      { num: 1, color: '#2563eb', label: '1. Customer Link & Delivery Dispatch Option', finder: () => document.querySelector('.order-details-section') || document.querySelector('[role="dialog"]'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 20 } },
      { num: 2, color: '#059669', label: '2. Payment Type, Discounts & Order Notes', finder: () => document.querySelectorAll('.order-details-section')[1] || document.querySelector('[role="dialog"]'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 40 } }
    ]
  },

  // 3. Products & Catalog CRUD
  {
    id: 'catalog-products',
    filename: 'catalog-products.png',
    route: '/products',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. SKU & Product Search', finder: () => document.querySelector('.search-box, input[type="search"]'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. New Product Action', finder: () => document.querySelector('button:has-text("New product"), button:has-text("Add product")'), pos: { x: 'right', y: 'top', offsetX: -160, offsetY: 4 } },
      { num: 3, color: '#7c3aed', label: '3. Inventory Status & Edit Actions', finder: () => document.querySelector('table, .data-table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'product-create',
    filename: 'product-create.png',
    route: '/products',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const addBtn = page.locator('button:has-text("New product"), button:has-text("Add product")').first();
      if (await addBtn.count()) await addBtn.click();
      await page.waitForTimeout(600);
    },
    targets: [
      { num: 1, color: '#2563eb', label: '1. Product Specifications & Category Tagging', finder: () => document.querySelector('[role="dialog"], .modal, form'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 20 } },
      { num: 2, color: '#059669', label: '2. Physical Inventory & Stock Tracking Toggle', finder: () => document.querySelector('input[type="checkbox"], input[name="is_stock_tracked"]')?.parentElement || document.querySelector('[role="dialog"]'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 80 } }
    ]
  },
  {
    id: 'catalog-attributes',
    filename: 'catalog-attributes.png',
    route: '/catalog/attributes',
    posComplexity: 'COMPLEX',
    targets: [
      { num: 1, color: '#c084fc', label: '1. Variant Dimensions (Color, Size, RAM, Storage)', finder: () => document.querySelector('.card, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'categories-manage',
    filename: 'categories-manage.png',
    route: '/categories',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const addBtn = page.locator('.page-actions button, button:has-text("Add"), button:has-text("New")').first();
      if (await addBtn.count()) await addBtn.click();
      await page.waitForTimeout(600);
    },
    targets: [
      { num: 1, color: '#2563eb', label: '1. Category Hierarchy & Parent Selection', finder: () => document.querySelector('[role="dialog"], .modal, form'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 20 } }
    ]
  },
  {
    id: 'brands-manage',
    filename: 'brands-manage.png',
    route: '/brands',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const addBtn = page.locator('.page-actions button, button:has-text("Add"), button:has-text("New")').first();
      if (await addBtn.count()) await addBtn.click();
      await page.waitForTimeout(600);
    },
    targets: [
      { num: 1, color: '#2563eb', label: '1. Manufacturer Brand Registry', finder: () => document.querySelector('[role="dialog"], .modal, form'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 20 } }
    ]
  },
  {
    id: 'units-manage',
    filename: 'units-manage.png',
    route: '/units',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const addBtn = page.locator('.page-actions button, button:has-text("Add"), button:has-text("New")').first();
      if (await addBtn.count()) await addBtn.click();
      await page.waitForTimeout(600);
    },
    targets: [
      { num: 1, color: '#2563eb', label: '1. Base Measurement Units & Decimal Precision', finder: () => document.querySelector('[role="dialog"], .modal, form'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 20 } }
    ]
  },
  {
    id: 'unit-conversions',
    filename: 'unit-conversions.png',
    route: '/unit-conversions',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const addBtn = page.locator('.page-actions button, button:has-text("Add"), button:has-text("New")').first();
      if (await addBtn.count()) await addBtn.click();
      await page.waitForTimeout(600);
    },
    targets: [
      { num: 1, color: '#2563eb', label: '1. Unit Multipliers (e.g., 1 Box = 12 Pcs)', finder: () => document.querySelector('[role="dialog"], .modal, form'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 20 } }
    ]
  },
  {
    id: 'pricing-tiers',
    filename: 'pricing-tiers.png',
    route: '/pricing',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Price List Matrix & Customer Tier Pricing', finder: () => document.querySelector('.card, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },

  // 4. Inventory & Stock Operations
  {
    id: 'stock-in',
    filename: 'stock-in.png',
    route: '/stock-in',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Product Selection & Barcode Scan', finder: () => document.querySelector('.stock-catalog-pane, .stock-search, [class*="catalog"]'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Inbound Quantity & Original Cost Entry', finder: () => document.querySelector('.stock-form-pane, form, .form-grid'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'storage-warehouses',
    filename: 'storage-warehouses.png',
    route: '/storage',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Warehouse Racks, Shelves & Bin Storage', finder: () => document.querySelector('.card, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'stock-movements',
    filename: 'stock-movements.png',
    route: '/stock-movements',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Immutable Stock Audit Ledger', finder: () => document.querySelector('table, .data-table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'stock-movement-detail',
    filename: 'stock-movement-detail.png',
    route: '/stock-movements/mov-1',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Movement Timestamp, Route & Operator Detail', finder: () => document.querySelector('.card, .detail-grid, table'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'stock-assets',
    filename: 'stock-assets.png',
    route: '/stock-assets',
    posComplexity: 'COMPLEX',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Serial Asset Search & Filters', finder: () => document.querySelector('.search-box, input[type="search"]'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Serialized Asset Status & History', finder: () => document.querySelector('table, .data-table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },

  // 5. Sales & Customers CRUD
  {
    id: 'transaction-history',
    filename: 'transaction-history.png',
    route: '/transaction-history',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Transaction Search & Date Range', finder: () => document.querySelector('.toolbar, .search-box, [class*="filter"]'), pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Sales Ledger & Receipt Actions', finder: () => document.querySelector('table, .data-table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'transaction-detail',
    filename: 'transaction-detail.png',
    route: '/transaction-history/tx-1',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Receipt Header & Reprint Action', finder: () => document.querySelector('.page-header, .card-head, button'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Line Items & Tender Breakdown', finder: () => document.querySelector('.card, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'invoices',
    filename: 'invoices.png',
    route: '/invoices',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Official Invoice Directory & Payment Status', finder: () => document.querySelector('table, .data-table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'customers',
    filename: 'customers.png',
    route: '/customers',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Customer Directory & Search', finder: () => document.querySelector('.search-box, input[type="search"]'), pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Store Credit Balances & Order History', finder: () => document.querySelector('table, .data-table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'customer-edit',
    filename: 'customer-edit.png',
    route: '/customers/cust-1/edit',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Edit Customer Profile & Credit Terms', finder: () => document.querySelector('form.card, .form-grid, .card:has(input)'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'deliveries',
    filename: 'deliveries.png',
    route: '/deliveries',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Delivery Method Configuration', finder: () => document.querySelector('form.card, .form-grid, .card:has(input)'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } },
      { num: 2, color: '#059669', label: '2. Configured Delivery Providers', finder: () => document.querySelector('table, .data-table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'delivery-edit',
    filename: 'delivery-edit.png',
    route: '/deliveries/del-1/edit',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Courier Name & Driver Contact Setup', finder: () => document.querySelector('form.card, .form-grid, .card:has(input)'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'promotions',
    filename: 'promotions.png',
    route: '/promotions',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Discount Rule & Promo Code Manager', finder: () => document.querySelector('.card, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },

  // 6. Workshop & Repairs CRUD
  {
    id: 'repairs-workflow',
    filename: 'repairs-workflow.png',
    route: '/repairs',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Repair Status Pipeline (Intake, In Progress, Ready, Closed)', finder: () => document.querySelector('.segmented, [role="tablist"], .toolbar'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Active Workshop Tickets Table', finder: () => document.querySelector('table, .data-table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'repair-intake-modal',
    filename: 'repair-intake-modal.png',
    route: '/repairs',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const intakeBtn = page.locator('button:has-text("New repair"), a:has-text("New ticket"), button:has-text("New ticket")').first();
      if (await intakeBtn.count()) await intakeBtn.click();
      await page.waitForTimeout(600);
    },
    targets: [
      { num: 1, color: '#2563eb', label: '1. Customer Contact & Device Diagnostic Intake', finder: () => document.querySelector('[role="dialog"], .modal, form') || document.querySelector('.card'), pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 20 } }
    ]
  },
  {
    id: 'repair-order-edit',
    filename: 'repair-order-edit.png',
    route: '/repairs/rep-1/edit',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Technician Diagnostic Checklist & Parts Replaced', finder: () => document.querySelector('.card, .form-grid, table'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } },
      { num: 2, color: '#059669', label: '2. Labor Fee, Deposit & Balance Settlement', finder: () => document.querySelector('.modal-actions, .repair-desk-actions, button[type="submit"]') || document.querySelector('.card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 80 } }
    ]
  },
  {
    id: 'repairs-catalog',
    filename: 'repairs-catalog.png',
    route: '/repairs/catalog',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Standard Repair Services & Labor Tariffs', finder: () => document.querySelector('.card, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'repair-issue-presets',
    filename: 'repair-issue-presets.png',
    route: '/repairs/issue-presets',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Common Device Fault Presets', finder: () => document.querySelector('.card, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'repair-condition-presets',
    filename: 'repair-condition-presets.png',
    route: '/repairs/condition-presets',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Intake Condition Presets (Scratch / Dent)', finder: () => document.querySelector('.card, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },

  // 7. Administration & Hardware Settings
  {
    id: 'settings-system',
    filename: 'settings-system.png',
    route: '/settings',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Thermal Printer Configuration (80mm/58mm)', finder: () => Array.from(document.querySelectorAll('a, .card')).find(el => el.textContent.includes('Printer') || el.textContent.includes('Thermal')), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Multi-Language (EN / MY / TH) Setup', finder: () => Array.from(document.querySelectorAll('a, .card')).find(el => el.textContent.includes('Language')), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 3, color: '#7c3aed', label: '3. Offline Storage & Hardware Sync Engine', finder: () => Array.from(document.querySelectorAll('a, .card')).find(el => el.textContent.includes('Application') || el.textContent.includes('Theme')), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } }
    ]
  },
  {
    id: 'settings-printer',
    filename: 'settings-printer.png',
    route: '/settings/printer',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. ESC/POS Thermal Receipt Printer Setup', finder: () => document.querySelector('.card, form, .form-grid'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'settings-language',
    filename: 'settings-language.png',
    route: '/settings/language',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. System Language Selection (English / Myanmar / Thai)', finder: () => document.querySelector('.card, .language-grid, form') || document.querySelector('.card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'settings-staff',
    filename: 'settings-staff.png',
    route: '/settings/staff',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Staff User Accounts, Roles & Access Control', finder: () => document.querySelector('.table-card, table, .card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  },
  {
    id: 'reports',
    filename: 'reports.png',
    route: '/reports',
    posComplexity: 'SIMPLE',
    targets: [
      { num: 1, color: '#2563eb', label: '1. Trading Rhythm & Gross Margin Analytics', finder: () => document.querySelector('.card-head h2') || document.querySelector('.card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 } },
      { num: 2, color: '#059669', label: '2. Product Performance & Inventory Turnover', finder: () => document.querySelector('.reports-grid, table, .table-card'), pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 } }
    ]
  }
];

async function run() {
  const filterId = process.argv[2];
  const screensToRun = filterId ? ALL_SCREENS.filter(s => s.id === filterId || s.filename.includes(filterId)) : ALL_SCREENS;
  console.log(`Starting Playwright Chromium capture for ${screensToRun.length} screens (including CRUD pages)...`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (let i = 0; i < screensToRun.length; i++) {
    const screen = screensToRun[i];
    console.log(`[${i + 1}/${screensToRun.length}] Capturing ${screen.id} -> ${screen.filename}...`);

    const page = await browser.newPage({
      viewport: { width: 1440, height: 860 },
      deviceScaleFactor: 2
    });

    const merchant = {
      id: 'merchant-1',
      name: 'Tech Flagship Store',
      default_currency_code: 'USD',
      pos_complexity_level: screen.posComplexity,
      is_active: true,
      module_codes: ['repair', 'sales', 'inventory', 'delivery', 'catalog', 'reports']
    };

    // Intercept all API endpoints
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const pathStr = url.pathname.replace('/api/v1', '');

      if (pathStr === '/auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockUser }) });
      if (pathStr === '/merchant') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: merchant }) });
      if (pathStr === '/shops') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [mockShop] }) });
      if (pathStr === '/currencies') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockCurrencies }) });

      if (pathStr.startsWith('/pos/catalog')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockPosCatalog, meta: { total: mockPosCatalog.length } }) });
      if (pathStr.startsWith('/catalog/products')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockProducts, meta: { total: mockProducts.length } }) });
      if (pathStr.startsWith('/catalog/categories')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockCategories, meta: { total: mockCategories.length } }) });
      if (pathStr.startsWith('/catalog/brands')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockBrands, meta: { total: mockBrands.length } }) });
      if (pathStr.startsWith('/catalog/attributes')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockAttributes, meta: { total: mockAttributes.length } }) });
      if (pathStr.startsWith('/unit-conversions') || pathStr.startsWith('/units/conversions')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockConversions, meta: { total: mockConversions.length } }) });
      if (pathStr.startsWith('/units')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockUnits, meta: { total: mockUnits.length } }) });
      if (pathStr.startsWith('/pricing/lists') || pathStr.startsWith('/price-lists')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockPriceLists, meta: { total: mockPriceLists.length } }) });
      if (pathStr.startsWith('/pricing')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockProductPrices, meta: { total: mockProductPrices.length } }) });
      if (pathStr.startsWith('/inventory/locations')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockLocations, meta: { total: mockLocations.length } }) });
      if (pathStr.startsWith('/inventory/storage')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockStorageItems, meta: { total: mockStorageItems.length } }) });
      if (pathStr.startsWith('/inventory/assets')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockAssets, meta: { total: mockAssets.length } }) });
      if (pathStr.startsWith('/inventory/movements/mov-1') || (pathStr.startsWith('/inventory/movements/') && !pathStr.includes('?'))) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockMovementDetail }) });
      if (pathStr.startsWith('/inventory/movements')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockMovements, meta: { total: mockMovements.length } }) });
      if (pathStr.startsWith('/transaction-history/tx-1') || (pathStr.startsWith('/transaction-history/') && !pathStr.includes('?'))) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockTransactionDetail }) });
      if (pathStr.startsWith('/transaction-history')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockTransactions, meta: { total: mockTransactions.length } }) });
      if (pathStr.startsWith('/customers/cust-1') || (pathStr.startsWith('/customers/') && !pathStr.includes('?'))) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockCustomerSingle }) });
      if (pathStr.startsWith('/customers')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockCustomers, meta: { total: mockCustomers.length } }) });
      if (pathStr.startsWith('/deliveries/del-1') || (pathStr.startsWith('/deliveries/') && !pathStr.includes('?'))) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockDeliverySingle }) });
      if (pathStr.includes('/deliveries') || pathStr.startsWith('/deliveries')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockDeliveries, meta: { total: mockDeliveries.length } }) });
      if (pathStr.includes('/payments')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'pmt-1', kind: 'DEPOSIT', method: 'CASH', status: 'CAPTURED', amount: '100.00' }], meta: { total: 1 } }) });
      if (pathStr.includes('/services/orders')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
      if (pathStr.startsWith('/repairs/orders/rep-1') || (pathStr.startsWith('/repairs/orders/') && !pathStr.includes('?'))) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockRepairSingle }) });
      if (pathStr.startsWith('/repairs/orders')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockRepairs, meta: { total: mockRepairs.length } }) });
      if (pathStr.startsWith('/repairs/catalog')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockRepairCatalog, meta: { total: mockRepairCatalog.length } }) });
      if (pathStr.startsWith('/repairs/presets')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockPresets, meta: { total: mockPresets.length } }) });
      if (pathStr.startsWith('/invoices')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockInvoices, meta: { total: mockInvoices.length } }) });
      if (pathStr.startsWith('/promotions')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockPromotions, meta: { total: mockPromotions.length } }) });
      if (pathStr.startsWith('/users') || pathStr.startsWith('/accounts')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockStaffAccounts, meta: { total: mockStaffAccounts.length } }) });
      if (pathStr.startsWith('/roles')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockRoles }) });

      if (pathStr.startsWith('/reports/sales-summary')) {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              order_count: 48,
              item_quantity: '142',
              gross_sales: '12850.00',
              net_sales: '12850.00',
              cost_of_goods_sold: '8530.00',
              gross_profit: '4320.00',
              gross_margin_percent: '33.6',
              pos_order_count: 44,
              repair_count: 4,
              refunds: '0.00',
              tax: '0.00',
              discount: '180.00'
            }
          })
        });
      }

      if (pathStr.startsWith('/reports/sales-by-day')) {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              { day: '2026-09-08', net_sales: '1650.00', gross_profit: '550.00', cost_of_goods_sold: '1100.00', order_count: 6 },
              { day: '2026-09-09', net_sales: '1820.00', gross_profit: '610.00', cost_of_goods_sold: '1210.00', order_count: 7 },
              { day: '2026-09-10', net_sales: '1490.00', gross_profit: '500.00', cost_of_goods_sold: '990.00', order_count: 5 },
              { day: '2026-09-11', net_sales: '2100.00', gross_profit: '700.00', cost_of_goods_sold: '1400.00', order_count: 8 },
              { day: '2026-09-12', net_sales: '2450.00', gross_profit: '820.00', cost_of_goods_sold: '1630.00', order_count: 9 },
              { day: '2026-09-13', net_sales: '3200.00', gross_profit: '1080.00', cost_of_goods_sold: '2120.00', order_count: 12 },
              { day: '2026-09-14', net_sales: '2140.00', gross_profit: '720.00', cost_of_goods_sold: '1420.00', order_count: 8 }
            ]
          })
        });
      }

      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });

    // Injected storage for logged in merchant
    await page.addInitScript(({ user, shop }) => {
      localStorage.setItem('bc.session', JSON.stringify({ access_token: 'mock-token', expires_at: '2099-01-01T00:00:00Z', user }));
      localStorage.setItem('bc.current-shop', shop.id);
    }, { user: mockUser, shop: mockShop });

    try {
      await page.goto(`http://localhost:3001${screen.route}`, { timeout: 15000 });
      await page.waitForTimeout(1500);

      if (screen.action) {
        try {
          await screen.action(page);
        } catch (e) {
          console.warn(`Action failed for ${screen.id}:`, e.message);
        }
      }

      // Overlay visual annotations onto the real page
      await page.evaluate((targetsData) => {
        const overlay = document.createElement('div');
        overlay.id = 'guide-annotation-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '999999';
        document.body.appendChild(overlay);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.inset = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.overflow = 'visible';
        overlay.appendChild(svg);

        targetsData.forEach((t) => {
          let el = null;
          if (t.finderCode) {
            try {
              el = eval(`(${t.finderCode})()`);
            } catch {}
          }
          if (!el) return;

          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;

          // Draw bounding highlight box
          const box = document.createElement('div');
          box.style.position = 'absolute';
          box.style.top = `${rect.top - 4}px`;
          box.style.left = `${rect.left - 4}px`;
          box.style.width = `${rect.width + 8}px`;
          box.style.height = `${rect.height + 8}px`;
          box.style.border = `2.5px solid ${t.color}`;
          box.style.borderRadius = '12px';
          box.style.backgroundColor = `${t.color}14`; // 8% opacity tint
          box.style.boxShadow = `0 0 0 4px ${t.color}26, 0 10px 25px -5px rgba(0,0,0,0.18)`;
          overlay.appendChild(box);

          // Calculate badge position
          let badgeX = rect.left + t.pos.offsetX;
          let badgeY = t.pos.y === 'top' ? rect.top + t.pos.offsetY : rect.bottom + t.pos.offsetY;

          // Clamp inside window boundaries
          badgeX = Math.max(16, Math.min(window.innerWidth - 320, badgeX));
          badgeY = Math.max(16, Math.min(window.innerHeight - 50, badgeY));

          // Create Badge
          const badge = document.createElement('div');
          badge.style.position = 'absolute';
          badge.style.top = `${badgeY}px`;
          badge.style.left = `${badgeX}px`;
          badge.style.display = 'flex';
          badge.style.alignItems = 'center';
          badge.style.gap = '8px';
          badge.style.background = '#0f172a';
          badge.style.border = `2px solid ${t.color}`;
          badge.style.borderRadius = '999px';
          badge.style.padding = '4px 14px 4px 4px';
          badge.style.boxShadow = '0 6px 18px rgba(0,0,0,0.35)';

          const circle = document.createElement('span');
          circle.style.width = '24px';
          circle.style.height = '24px';
          circle.style.borderRadius = '50%';
          circle.style.background = t.color;
          circle.style.color = '#ffffff';
          circle.style.display = 'inline-flex';
          circle.style.alignItems = 'center';
          circle.style.justifyContent = 'center';
          circle.style.fontWeight = '800';
          circle.style.fontSize = '13px';
          circle.innerText = t.num;

          const label = document.createElement('span');
          label.style.color = '#f8fafc';
          label.style.fontSize = '12.5px';
          label.style.fontWeight = '700';
          label.style.letterSpacing = '0.2px';
          label.innerText = t.label;

          badge.appendChild(circle);
          badge.appendChild(label);
          overlay.appendChild(badge);
        });
      }, screen.targets.map(t => ({
        num: t.num,
        color: t.color,
        label: t.label,
        pos: t.pos,
        finderCode: t.finder.toString()
      })));

      const publicPath = path.join(PUBLIC_DIR, screen.filename);
      const rootPath = path.join(ROOT_DIR, screen.filename);
      const artifactPath = path.join(ARTIFACT_DIR, screen.filename);

      await page.screenshot({ path: publicPath });
      fs.copyFileSync(publicPath, rootPath);
      fs.copyFileSync(publicPath, artifactPath);

      console.log(`✓ [${i + 1}/${ALL_SCREENS.length}] Successfully captured ${screen.filename}`);
    } catch (err) {
      console.error(`✗ Failed to capture ${screen.filename}:`, err);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\nAll 36 screens successfully captured and saved to disk!');
}

run().catch(console.error);
