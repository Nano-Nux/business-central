import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/lonsh/.gemini/antigravity-ide/brain/38772d57-cf68-4611-8e3c-5cdda553478c/guide-screenshots';
const PUBLIC_DIR = 'public/guide-screenshots';
const ROOT_DIR = 'guide-screenshots';

[PUBLIC_DIR, ROOT_DIR, ARTIFACT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Comprehensive mock datasets
const mockUser = {
  id: 'user-1',
  merchant_id: 'merchant-1',
  display_name: 'Alexander Wright',
  email: 'alexander@techflagship.com',
  is_active: true,
  roles: [{ code: 'OWNER', permission_codes: ['*'] }]
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
    description: '16-inch Liquid Retina XDR, Apple M3 Max, Space Black',
    barcode: '8801234001',
    brand_id: 'brand-apple',
    category_ids: ['cat-mac'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '2499.00',
    cost: '2100.00',
    images: []
  },
  {
    id: 'prod-2',
    name: 'iPhone 15 Pro',
    product_type: 'PHYSICAL',
    description: 'Titanium design, A17 Pro chip, Action button, USB-C',
    barcode: '8801234002',
    brand_id: 'brand-apple',
    category_ids: ['cat-phones'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '1099.00',
    cost: '899.00',
    images: []
  },
  {
    id: 'prod-3',
    name: 'AirPods Pro (2nd Gen)',
    product_type: 'PHYSICAL',
    description: 'Active Noise Cancellation, Transparency mode, USB-C case',
    barcode: '8801234003',
    brand_id: 'brand-apple',
    category_ids: ['cat-audio'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '249.00',
    cost: '180.00',
    images: []
  },
  {
    id: 'prod-4',
    name: 'iPad Air 11" M2',
    product_type: 'PHYSICAL',
    description: 'Liquid Retina display, M2 chip, Landscape front camera',
    barcode: '8801234004',
    brand_id: 'brand-apple',
    category_ids: ['cat-tablets'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '599.00',
    cost: '480.00',
    images: []
  },
  {
    id: 'prod-5',
    name: 'Sony WH-1000XM5',
    product_type: 'PHYSICAL',
    description: 'Industry-leading noise canceling wireless headphones',
    barcode: '8801234007',
    brand_id: 'brand-sony',
    category_ids: ['cat-audio'],
    is_active: true,
    is_stock_tracked: true,
    sell_price: '399.00',
    cost: '290.00',
    images: []
  }
];

const mockCategories = [
  { id: 'cat-mac', name: 'Laptops & Computers', is_active: true },
  { id: 'cat-phones', name: 'Smartphones', is_active: true },
  { id: 'cat-audio', name: 'Audio & Headphones', is_active: true },
  { id: 'cat-tablets', name: 'Tablets & E-Readers', is_active: true },
  { id: 'cat-accessories', name: 'Cables & Accessories', is_active: true }
];

const mockBrands = [
  { id: 'brand-apple', name: 'Apple', is_active: true },
  { id: 'brand-sony', name: 'Sony', is_active: true },
  { id: 'brand-samsung', name: 'Samsung', is_active: true },
  { id: 'brand-logitech', name: 'Logitech', is_active: true }
];

const mockUnits = [
  { id: 'unit-pcs', code: 'PCS', name: 'Piece', symbol: 'pcs', allows_decimal: false, is_active: true },
  { id: 'unit-box', code: 'BOX', name: 'Box (10pcs)', symbol: 'box', allows_decimal: false, is_active: true }
];

const mockAttributes = [
  {
    id: 'attr-color',
    code: 'COLOR',
    name: 'Finish & Color',
    value_type: 'OPTIONS',
    options: [
      { id: 'opt-sb', label: 'Space Black', value: 'space_black', sort_order: 1 },
      { id: 'opt-sl', label: 'Silver', value: 'silver', sort_order: 2 },
      { id: 'opt-nt', label: 'Natural Titanium', value: 'natural_titanium', sort_order: 3 },
      { id: 'opt-mb', label: 'Midnight Blue', value: 'midnight_blue', sort_order: 4 }
    ]
  },
  {
    id: 'attr-storage',
    code: 'STORAGE',
    name: 'Storage Capacity',
    value_type: 'OPTIONS',
    options: [
      { id: 'opt-128', label: '128 GB NVMe', value: '128gb', sort_order: 1 },
      { id: 'opt-256', label: '256 GB NVMe', value: '256gb', sort_order: 2 },
      { id: 'opt-512', label: '512 GB NVMe', value: '512gb', sort_order: 3 },
      { id: 'opt-1tb', label: '1 TB High-Speed SSD', value: '1tb', sort_order: 4 }
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
  }
];

const mockLocations = [
  { id: 'loc-1', shop_id: 'shop-1', name: 'Main Sales Floor - Shelf A', code: 'FLR-A', is_active: true },
  { id: 'loc-2', shop_id: 'shop-1', name: 'Backroom Storage - Rack 3', code: 'BCK-R3', is_active: true },
  { id: 'loc-3', shop_id: 'shop-1', name: 'Secure Device Safe 01', code: 'SAFE-01', is_active: true }
];

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
  },
  {
    catalog: 'Audio → Headphones',
    variant_name: 'Silver Wireless Over-Ear',
    brand: 'Sony',
    product_name: 'Sony WH-1000XM5',
    unit: 'pcs',
    stock_count: '14',
    sell_price: '399.00',
    original_price: '290.00',
    profit: '109.00',
    manufacture_date: '2026-02-20',
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
  },
  {
    id: 'ast-4',
    asset_code: 'BC-SER-994824',
    serial_number: 'SN-SNY-55291880',
    product_name: 'Sony WH-1000XM5',
    variant_name: 'Silver Wireless Over-Ear',
    status: 'SOLD',
    location_name: 'Main Sales Floor - Shelf A',
    created_at: '2026-09-13T09:45:00Z'
  }
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
  },
  {
    id: 'tx-4',
    event_type: 'TRANSACTION',
    reference: 'INV-2026-0839',
    channel: 'pos',
    occurred_at: '2026-09-13T15:10:00Z',
    customer_name: 'Olivia Chen',
    customer_phone: '+1 555 890 1234',
    product_name: 'AirPods Pro (2nd Gen)',
    variant_name: 'MagSafe Case (USB-C)',
    sku: 'APP-GEN2',
    payment_method: 'CASH',
    quantity: '1',
    amount: '249.00',
    currency_code: 'USD',
    status: 'COMPLETED',
    details: 'AirPods Pro (2nd Gen)'
  },
  {
    id: 'tx-5',
    event_type: 'REFUND',
    reference: 'REF-2026-0012',
    channel: 'pos',
    occurred_at: '2026-09-13T11:20:00Z',
    customer_name: 'Kenji Sato',
    customer_phone: '+1 555 777 8899',
    product_name: '20W USB-C Power Adapter',
    variant_name: 'Compact Fast Charger',
    sku: 'A20W-USBC',
    payment_method: 'CASH',
    quantity: '-1',
    amount: '-19.00',
    currency_code: 'USD',
    status: 'REFUNDED',
    details: 'Returned unopened adapter'
  }
];

const mockCustomers = [
  {
    id: 'cust-1',
    display_name: 'Sarah Jenkins',
    phone: '+1 555 234 5678',
    email: 'sarah.j@email.com',
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
    order_count: 14,
    repair_count: 0,
    store_credit: '0.00',
    created_at: '2025-08-15T14:30:00Z'
  },
  {
    id: 'cust-3',
    display_name: 'Olivia Chen',
    phone: '+1 555 890 1234',
    email: 'ochen@design.org',
    order_count: 5,
    repair_count: 1,
    store_credit: '85.00',
    created_at: '2026-01-20T09:15:00Z'
  },
  {
    id: 'cust-4',
    display_name: 'David Miller',
    phone: '+1 555 456 7890',
    email: 'dmiller@gmail.com',
    order_count: 3,
    repair_count: 0,
    store_credit: '12.50',
    created_at: '2026-02-14T16:00:00Z'
  }
];

const mockDeliveries = [
  {
    id: 'del-1',
    name: 'DHL Express Dispatch',
    contact_info: 'Carlos (+1 555 992 1401)',
    shop_id: 'shop-1',
    is_active: true
  },
  {
    id: 'del-2',
    name: 'Downtown Van Courier',
    contact_info: 'Store Internal Fleet #2',
    shop_id: 'shop-1',
    is_active: true
  },
  {
    id: 'del-3',
    name: 'Standard Ground Delivery',
    contact_info: 'FedEx Local Hub 14',
    shop_id: 'shop-1',
    is_active: true
  }
];

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
  },
  {
    id: 'rep-3',
    ticket_number: 'REP-2026-0102',
    customer_name: 'Olivia Chen',
    customer_phone: '+1 555 890 1234',
    device_brand: 'Apple',
    device_model: 'iPad Air 5',
    issue_description: 'USB-C charging port pin damage replacement',
    status: 'READY_FOR_PICKUP',
    stage: 'Ready',
    estimated_price: '120.00',
    created_at: '2026-09-10T11:00:00Z'
  },
  {
    id: 'rep-4',
    ticket_number: 'REP-2026-0098',
    customer_name: 'Kenji Sato',
    customer_phone: '+1 555 777 8899',
    device_brand: 'Samsung',
    device_model: 'Galaxy S24 Ultra',
    issue_description: 'Sapphire camera glass lens shattered',
    status: 'CLOSED',
    stage: 'Closed',
    estimated_price: '150.00',
    created_at: '2026-09-08T09:30:00Z'
  }
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
    payment_status: 'PAID',
    items: [
      { name: 'iPhone 15 Pro 256GB Natural Titanium', quantity: 1, unit_price: '1099.00' },
      { name: '20W USB-C Fast Charger Power Adapter', quantity: 1, unit_price: '19.00' }
    ]
  },
  {
    id: 'inv-2',
    number: 'INV-2026-0841',
    customer: 'Marcus Vance',
    customer_phone: '+1 555 345 6789',
    merchant_name: 'Tech Flagship Store',
    shop_name: 'Downtown Flagship',
    shop_id: 'shop-1',
    currency_code: 'USD',
    created_at: '2026-09-14T08:30:00Z',
    status: 'COMPLETED',
    kind: 'pos',
    subtotal: '2499.00',
    discount_total: '0.00',
    tax_total: '0.00',
    grand_total: '2499.00',
    payment_status: 'PAID',
    items: [
      { name: 'MacBook Pro 16" M3 Max (36GB / 1TB)', quantity: 1, unit_price: '2499.00' }
    ]
  },
  {
    id: 'inv-3',
    number: 'INV-2026-0840',
    customer: 'Olivia Chen',
    customer_phone: '+1 555 890 1234',
    merchant_name: 'Tech Flagship Store',
    shop_name: 'Downtown Flagship',
    shop_id: 'shop-1',
    currency_code: 'USD',
    created_at: '2026-09-13T17:45:00Z',
    status: 'COMPLETED',
    kind: 'repair',
    subtotal: '380.00',
    discount_total: '0.00',
    tax_total: '0.00',
    grand_total: '380.00',
    payment_status: 'PAID',
    items: [
      { name: 'Liquid Retina XDR Display Replacement', quantity: 1, unit_price: '380.00' }
    ]
  }
];

const mockTopProducts = [
  {
    product_name: 'MacBook Pro 16" M3 Max',
    variant_name: '36GB RAM / 1TB SSD Space Black',
    sku: 'MBP-16-M3',
    item_quantity: '18',
    net_sales: '44982.00',
    gross_profit: '7182.00'
  },
  {
    product_name: 'iPhone 15 Pro',
    variant_name: '256GB Natural Titanium',
    sku: 'IP15P-256',
    item_quantity: '34',
    net_sales: '37366.00',
    gross_profit: '6800.00'
  },
  {
    product_name: 'AirPods Pro (2nd Gen)',
    variant_name: 'MagSafe Case (USB-C)',
    sku: 'APP-GEN2',
    item_quantity: '62',
    net_sales: '15438.00',
    gross_profit: '4278.00'
  },
  {
    product_name: 'Sony WH-1000XM5',
    variant_name: 'Silver Wireless Over-Ear',
    sku: 'WH1000XM5',
    item_quantity: '14',
    net_sales: '5586.00',
    gross_profit: '1526.00'
  }
];

const mockPromotions = [
  {
    id: 'promo-1',
    name: 'SUMMER2026 - 15% Storewide',
    description: '15% discount on all premium laptops, smartphones, and audio gear',
    promotion_type: 'PERCENTAGE',
    value: '15.00',
    minimum_subtotal: '100.00',
    redemption_count: 42,
    start_date: '2026-06-01T00:00:00Z',
    end_date: '2026-09-30T23:59:59Z',
    is_active: true,
    target_scope: 'STOREWIDE'
  },
  {
    id: 'promo-2',
    name: 'NEWCUSTOMER - $20 Off First Visit',
    description: 'Instant $20 voucher for all newly registered client accounts',
    promotion_type: 'FIXED_AMOUNT',
    value: '20.00',
    minimum_subtotal: '50.00',
    redemption_count: 18,
    start_date: '2026-01-01T00:00:00Z',
    end_date: '2026-12-31T23:59:59Z',
    is_active: true,
    target_scope: 'STOREWIDE'
  },
  {
    id: 'promo-3',
    name: 'REPAIRCARE - 10% Off Screen Services',
    description: 'Promotional bundle discount for genuine display replacements',
    promotion_type: 'PERCENTAGE',
    value: '10.00',
    minimum_subtotal: '80.00',
    redemption_count: 9,
    start_date: '2026-08-01T00:00:00Z',
    end_date: '2026-10-31T23:59:59Z',
    is_active: true,
    target_scope: 'REPAIR'
  }
];

const mockStaffAccounts = [
  {
    id: 'stf-1',
    display_name: 'Alexander Wright',
    email: 'alexander@techflagship.com',
    phone: '+1 555 019 2831',
    roles: [{ id: 'r-1', code: 'OWNER', name: 'Owner' }],
    is_active: true,
    last_login: '2026-09-14T08:00:00Z'
  },
  {
    id: 'stf-2',
    display_name: 'Elena Rostova',
    email: 'elena.r@techflagship.com',
    phone: '+1 555 019 2832',
    roles: [{ id: 'r-2', code: 'MANAGER', name: 'Shop Floor Manager' }],
    is_active: true,
    last_login: '2026-09-14T08:15:00Z'
  },
  {
    id: 'stf-3',
    display_name: 'Kenji Sato',
    email: 'kenji.s@techflagship.com',
    phone: '+1 555 019 2833',
    roles: [{ id: 'r-3', code: 'TECHNICIAN', name: 'Diagnostics Lead' }],
    is_active: true,
    last_login: '2026-09-14T08:30:00Z'
  },
  {
    id: 'stf-4',
    display_name: 'Maya Lin',
    email: 'maya.l@techflagship.com',
    phone: '+1 555 019 2834',
    roles: [{ id: 'r-4', code: 'STAFF', name: 'POS Cashier' }],
    is_active: true,
    last_login: '2026-09-14T09:00:00Z'
  }
];

// Definition of all 19 screens with target elements and custom actions
const SCREENS = [
  {
    id: 'dashboard',
    filename: 'dashboard-overview.png',
    route: '/dashboard',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Real-time KPI Metric Cards',
        finder: () => document.querySelector('.stats-grid, [class*="stats"], [class*="grid"]'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Quick Action POS Button',
        finder: () => Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.includes('Open POS')),
        pos: { x: 'left', y: 'bottom', offsetX: -80, offsetY: 22 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. Live Sales Rhythm & Volume',
        finder: () => {
          const h2 = Array.from(document.querySelectorAll('h2, h3')).find(el => el.textContent.includes('Sales rhythm'));
          return h2 ? h2.closest('.card') || h2.parentElement : null;
        },
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      },
      {
        num: 4,
        color: '#d97706',
        label: '4. Urgent Stock & Sync Alerts',
        finder: () => {
          const h2 = Array.from(document.querySelectorAll('h2, h3')).find(el => el.textContent.includes('Right now'));
          return h2 ? h2.closest('.card') || h2.parentElement : null;
        },
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      }
    ]
  },
  {
    id: 'pos-mini',
    filename: 'pos-mini.png',
    route: '/pos',
    posComplexity: 'MINI',
    action: async (page) => {
      const firstItem = page.locator('button:has-text("MacBook Pro"), .pos-item-card, [class*="product-card"]').first();
      if (await firstItem.count() > 0) {
        await firstItem.click();
        await page.waitForTimeout(400);
      }
    },
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Quick Search & Barcode Input',
        finder: () => document.querySelector('input[type="search"], input[placeholder*="Search"], input[placeholder*="barcode"]'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Single-Tap Product Grid',
        finder: () => document.querySelector('.pos-catalog-grid, .product-grid, [class*="grid"]'),
        pos: { x: 'left', y: 'top', offsetX: 20, offsetY: 20 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. Live Cart Ticket Summary',
        finder: () => document.querySelector('.pos-cart, [class*="cart-pane"], aside'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 16 }
      },
      {
        num: 4,
        color: '#d97706',
        label: '4. Instant Cash Checkout Button',
        finder: () => Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Check out') || el.textContent.includes('Checkout')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      }
    ]
  },
  {
    id: 'pos-simple',
    filename: 'pos-simple.png',
    route: '/pos',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const firstItem = page.locator('button:has-text("iPhone 15 Pro"), .pos-item-card, [class*="product-card"]').first();
      if (await firstItem.count() > 0) {
        await firstItem.click();
        await page.waitForTimeout(400);
      }
    },
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Search & Barcode Scanning',
        finder: () => document.querySelector('input[type="search"], input[placeholder*="Search"]'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Customer Account & Order Details',
        finder: () => Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Details')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. Cart Line Item & Modifiers',
        finder: () => document.querySelector('.pos-cart-item, [class*="cart-item"], [class*="cart-row"]') || document.querySelector('.pos-cart, aside'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      },
      {
        num: 4,
        color: '#d97706',
        label: '4. Tender Settlement & Print Slip',
        finder: () => Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Check out') || el.textContent.includes('Checkout')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      }
    ]
  },
  {
    id: 'pos-complex',
    filename: 'pos-complex.png',
    route: '/pos',
    posComplexity: 'COMPLEX',
    action: async (page) => {
      const firstItem = page.locator('button:has-text("MacBook Pro"), .pos-item-card, [class*="product-card"]').first();
      if (await firstItem.count() > 0) {
        await firstItem.click();
        await page.waitForTimeout(400);
      }
    },
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. High-Speed Barcode & SKU Search',
        finder: () => document.querySelector('input[type="search"], input[placeholder*="Search"]'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Matrix Variant Card Display',
        finder: () => document.querySelector('.pos-item-card, [class*="product-card"]'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. Serial Asset & Courier Dispatch',
        finder: () => Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Details')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 4,
        color: '#d97706',
        label: '4. Multi-Tender Checkout Engine',
        finder: () => Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Check out') || el.textContent.includes('Checkout')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      }
    ]
  },
  {
    id: 'catalog-products',
    filename: 'catalog-products.png',
    route: '/products',
    posComplexity: 'COMPLEX',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Add New Product Action',
        finder: () => Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.includes('New product') || el.textContent.includes('Add product')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Real-time Search & Filter Bar',
        finder: () => document.querySelector('.search-box, input[type="search"], [class*="search"]'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. Product Catalog Table & Stock Valuation',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'catalog-attributes',
    filename: 'catalog-attributes.png',
    route: '/catalog/attributes',
    posComplexity: 'COMPLEX',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Create Attribute Group',
        finder: () => Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.includes('New attribute') || el.textContent.includes('Add attribute')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Permutation Value Set Badges',
        finder: () => document.querySelector('.badge, [class*="pill"], [class*="chip"]') || document.querySelector('tbody tr td:nth-child(3)'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. SKU Variant Matrix Rules',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'storage',
    filename: 'storage-warehouses.png',
    route: '/storage',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Storage Inventory Audit Table',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Real-time Quantity & Valuation',
        finder: () => document.querySelector('tbody tr') || document.querySelector('table th:nth-child(6)'),
        pos: { x: 'left', y: 'top', offsetX: 20, offsetY: -16 }
      }
    ]
  },
  {
    id: 'stock-in',
    filename: 'stock-in.png',
    route: '/stock-in',
    posComplexity: 'SIMPLE',
    action: async (page) => {
      const itemBtn = page.locator('button.stock-product-card, [class*="stock-product"]').first();
      if (await itemBtn.count() > 0) {
        await itemBtn.click();
        await page.waitForTimeout(400);
      }
    },
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Select Product from Catalog',
        finder: () => document.querySelector('.stock-catalog-pane, .stock-catalog-card, section:first-child'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Destination Location & Quantity Input',
        finder: () => document.querySelector('.stock-receipt-form, form, section:nth-child(2)'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. Receive Stock Action Button',
        finder: () => document.querySelector('.stock-receipt-card button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Add to stock') || el.textContent.includes('Receive')),
        pos: { x: 'left', y: 'top', offsetX: -80, offsetY: -16 }
      }
    ]
  },
  {
    id: 'stock-assets',
    filename: 'stock-assets.png',
    route: '/stock-assets',
    posComplexity: 'COMPLEX',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Serial Asset Search & Filters',
        finder: () => document.querySelector('.search-box, input[type="search"], [class*="search"]'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Serialized Asset Status & History',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'stock-movements',
    filename: 'stock-movements.png',
    route: '/stock-movements',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Immutable Stock Audit Ledger',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'transaction-history',
    filename: 'transaction-history.png',
    route: '/transaction-history',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Transaction Search & Date Range',
        finder: () => document.querySelector('.toolbar, .search-box, [class*="filter"]'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Sales Ledger & Receipt Actions',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'customers',
    filename: 'customers.png',
    route: '/customers',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Customer Directory Search & Activity Filter',
        finder: () => document.querySelector('.search-box, input[type="search"]'),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Customer Accounts & Credit Balances',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'deliveries',
    filename: 'deliveries.png',
    route: '/deliveries',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Delivery Method & Courier Contact Configuration',
        finder: () => document.querySelector('form.card, .form-grid, .card:has(input)'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Configured Delivery Providers & Actions',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'repairs',
    filename: 'repairs-workflow.png',
    route: '/repairs',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. 4-Stage Repair Pipeline Tracker',
        finder: () => Array.from(document.querySelectorAll('div, section')).find(el => el.children.length >= 4 && el.textContent.includes('In progress') && el.textContent.includes('Repaired')),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Device Diagnosis & Job Cards',
        finder: () => document.querySelector('.repair-card, table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. Create New Repair Ticket Action',
        finder: () => Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.includes('New repair') || el.textContent.includes('New ticket')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      }
    ]
  },
  {
    id: 'invoices',
    filename: 'invoices.png',
    route: '/invoices',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Invoice Ledger & Print Actions (80mm/58mm)',
        finder: () => document.querySelector('table, .data-table, .table-card'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Thermal Receipt Print & PDF Export',
        finder: () => document.querySelector('tbody tr td:last-child') || document.querySelector('.button-group'),
        pos: { x: 'left', y: 'top', offsetX: -120, offsetY: -16 }
      }
    ]
  },
  {
    id: 'reports',
    filename: 'reports.png',
    route: '/reports',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Net Sales & Profit Performance KPIs',
        finder: () => document.querySelector('.stats-grid, [class*="stats"], [class*="grid"]'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Top Selling Products & Margin Breakdown',
        finder: () => Array.from(document.querySelectorAll('.card')).find(el => el.querySelector('h2')?.textContent.includes('Top products')) || document.querySelector('.rank-list') || document.querySelector('.card:last-child'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'promotions',
    filename: 'promotions.png',
    route: '/promotions',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Create Promotional Campaign',
        finder: () => Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.includes('New promotion') || el.textContent.includes('Add promotion')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Discount Rules & Condition Matrix',
        finder: () => document.querySelector('.promo-card, .promo-grid'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'staff-accounts',
    filename: 'staff-accounts.png',
    route: '/accounts',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Invite Team Member',
        finder: () => Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.includes('Add staff') || el.textContent.includes('New member') || el.textContent.includes('Invite')),
        pos: { x: 'left', y: 'top', offsetX: 12, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Staff Roles, PINs & Permissions',
        finder: () => document.querySelector('.table-card, table'),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: 20 }
      }
    ]
  },
  {
    id: 'settings-system',
    filename: 'settings-system.png',
    route: '/settings',
    posComplexity: 'SIMPLE',
    targets: [
      {
        num: 1,
        color: '#2563eb',
        label: '1. Thermal Printer Configuration (80mm/58mm)',
        finder: () => Array.from(document.querySelectorAll('a, .card')).find(el => el.textContent.includes('Printer') || el.textContent.includes('Thermal')),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        label: '2. Multi-Language (EN / MY / TH) Setup',
        finder: () => Array.from(document.querySelectorAll('a, .card')).find(el => el.textContent.includes('Language')),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      },
      {
        num: 3,
        color: '#7c3aed',
        label: '3. Offline Storage & Hardware Sync Engine',
        finder: () => Array.from(document.querySelectorAll('a, .card')).find(el => el.textContent.includes('Application') || el.textContent.includes('Theme')),
        pos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      }
    ]
  }
];

async function run() {
  console.log('Starting Playwright Chromium capture for all 19 screens...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (let i = 0; i < SCREENS.length; i++) {
    const screen = SCREENS[i];
    console.log(`[${i + 1}/${SCREENS.length}] Capturing ${screen.id} -> ${screen.filename}...`);

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
      if (pathStr.startsWith('/units')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockUnits, meta: { total: mockUnits.length } }) });
      if (pathStr.startsWith('/inventory/locations')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockLocations, meta: { total: mockLocations.length } }) });
      if (pathStr.startsWith('/inventory/storage')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockStorageItems, meta: { total: mockStorageItems.length } }) });
      if (pathStr.startsWith('/inventory/assets')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockAssets, meta: { total: mockAssets.length } }) });
      if (pathStr.startsWith('/inventory/movements')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockMovements, meta: { total: mockMovements.length } }) });
      if (pathStr.startsWith('/transaction-history')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockTransactions, meta: { total: mockTransactions.length } }) });
      if (pathStr.startsWith('/customers')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockCustomers, meta: { total: mockCustomers.length } }) });
      if (pathStr.includes('/deliveries') || pathStr.startsWith('/deliveries')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockDeliveries, meta: { total: mockDeliveries.length } }) });
      if (pathStr.startsWith('/repairs/orders')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockRepairs, meta: { total: mockRepairs.length } }) });
      if (pathStr.startsWith('/invoices')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockInvoices, meta: { total: mockInvoices.length } }) });
      if (pathStr.startsWith('/promotions')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockPromotions, meta: { total: mockPromotions.length } }) });
      if (pathStr.startsWith('/users') || pathStr.startsWith('/accounts')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockStaffAccounts, meta: { total: mockStaffAccounts.length } }) });
      if (pathStr.startsWith('/roles')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'r-1', code: 'OWNER', name: 'Owner', permission_codes: ['*'] }, { id: 'r-2', code: 'STAFF', name: 'Staff', permission_codes: ['stock_in'] }, { id: 'r-3', code: 'MANAGER', name: 'Shop Floor Manager', permission_codes: ['*'] }] }) });

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

      if (pathStr.startsWith('/reports/top-products')) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: mockTopProducts }) });
      }

      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });

    // Injected storage for logged in merchant
    await page.addInitScript(({ user, shop }) => {
      localStorage.setItem('bc.session', JSON.stringify({ access_token: 'mock-token', expires_at: '2099-01-01T00:00:00Z', user }));
      localStorage.setItem('bc.current-shop', shop.id);
    }, { user: mockUser, shop: mockShop });

    await page.goto(`http://localhost:3001${screen.route}`);
    await page.waitForTimeout(2000);

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

        // Dashed connection line if offset
        if (t.pos.y === 'bottom') {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', `${badgeX + 20}`);
          line.setAttribute('y1', `${badgeY}`);
          line.setAttribute('x2', `${rect.left + rect.width / 2}`);
          line.setAttribute('y2', `${rect.bottom + 4}`);
          line.setAttribute('stroke', t.color);
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-dasharray', '3 3');
          svg.appendChild(line);
        }
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

    console.log(`✓ Successfully captured and saved ${screen.filename}`);
    await page.close();
  }

  await browser.close();
  console.log('\nAll 19 actual screenshots captured, annotated, and saved successfully!');
}

run().catch(console.error);
