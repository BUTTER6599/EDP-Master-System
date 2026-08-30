/**
 * MockData.gs — DEMO DATA ONLY
 * The Electronics Depot LLC — EDP OS Register (clean rebuild)
 *
 * SAFETY CONTRACT FOR THIS FILE:
 *   - Every record below is invented for layout review.
 *   - No real customers. Phone numbers use the reserved 555-01xx range.
 *   - No real inventory, no real serials, no real pricing authority.
 *   - Nothing here reads from or writes to any spreadsheet or database.
 *
 * When the real data layer lands, this file gets replaced by a read-only
 * repository module — it does not get "wired up" in place.
 */

/**
 * Mock inventory. `photoKey` selects a locally generated SVG placeholder in
 * the client; there are no external image URLs anywhere in this build.
 */
function getMockInventory() {
  return [
    {
      itemId: 'EDP-10241', category: 'Refrigerator', brand: 'Whirlpool',
      model: 'WRS325SDHZ', description: 'Side-by-Side 25 cu. ft. Stainless',
      price: 749.00, condition: 'Certified Reconditioned',
      availability: 'AVAILABLE', qty: 2, location: 'Floor A-3',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'refrigerator'
    },
    {
      itemId: 'EDP-10255', category: 'Refrigerator', brand: 'Samsung',
      model: 'RF263BEAESR', description: 'French Door 25 cu. ft. Stainless',
      price: 899.00, condition: 'Open Box',
      availability: 'AVAILABLE', qty: 1, location: 'Floor A-1',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'refrigerator'
    },
    {
      itemId: 'EDP-10430', category: 'Refrigerator', brand: 'LG',
      model: 'LTCS20020S', description: 'Top Freezer 20 cu. ft.',
      price: 679.00, condition: 'Certified Reconditioned',
      availability: 'SOLD', qty: 0, location: 'Staged — Delivery',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'refrigerator'
    },
    {
      itemId: 'EDP-10188', category: 'Washer', brand: 'Maytag',
      model: 'MVWC565FW', description: 'Top Load Agitator 3.8 cu. ft.',
      price: 429.00, condition: 'Certified Reconditioned',
      availability: 'AVAILABLE', qty: 3, location: 'Floor B-2',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'washer'
    },
    {
      itemId: 'EDP-10401', category: 'Washer', brand: 'LG',
      model: 'WM3400CW', description: 'Front Load 4.5 cu. ft. White',
      price: 599.00, condition: 'Open Box',
      availability: 'ON_HOLD', qty: 1, location: 'Hold Rack — 48 hr',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'washer'
    },
    {
      itemId: 'EDP-10190', category: 'Dryer', brand: 'Maytag',
      model: 'MEDC465HW', description: 'Electric Dryer 7.0 cu. ft.',
      price: 399.00, condition: 'Certified Reconditioned',
      availability: 'AVAILABLE', qty: 2, location: 'Floor B-3',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'dryer'
    },
    {
      itemId: 'EDP-10312', category: 'Range', brand: 'GE',
      model: 'JB645RKSS', description: 'Electric Smooth Top Range Stainless',
      price: 549.00, condition: 'Certified Reconditioned',
      availability: 'AVAILABLE', qty: 1, location: 'Floor C-1',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'range'
    },
    {
      itemId: 'EDP-10444', category: 'Range', brand: 'Whirlpool',
      model: 'WFE515S0JS', description: 'Electric Range 5.3 cu. ft. Stainless',
      price: 519.00, condition: 'Open Box',
      availability: 'AVAILABLE', qty: 2, location: 'Floor C-2',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'range'
    },
    {
      itemId: 'EDP-10333', category: 'Dishwasher', brand: 'Bosch',
      model: 'SHXM63WS5N', description: '300 Series Built-In Stainless',
      price: 479.00, condition: 'Open Box',
      availability: 'LOW_STOCK', qty: 1, location: 'Floor C-4',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'dishwasher'
    },
    {
      itemId: 'EDP-10077', category: 'Freezer', brand: 'Frigidaire',
      model: 'FFFU13F2VW', description: 'Upright Freezer 13 cu. ft. White',
      price: 389.00, condition: 'Certified Reconditioned',
      availability: 'AVAILABLE', qty: 2, location: 'Floor A-6',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'freezer'
    },
    {
      itemId: 'EDP-10422', category: 'Microwave', brand: 'GE',
      model: 'JVM3160RFSS', description: 'Over-the-Range 1.6 cu. ft.',
      price: 149.00, condition: 'Certified Reconditioned',
      availability: 'AVAILABLE', qty: 4, location: 'Shelf D-1',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'microwave'
    },
    {
      itemId: 'EDP-10419', category: 'Television', brand: 'Samsung',
      model: 'UN55TU7000', description: '55" 4K UHD Smart TV',
      price: 329.00, condition: 'Open Box',
      availability: 'AVAILABLE', qty: 1, location: 'Wall E-2',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'television'
    }
  ];
}

/** Category filter chips, derived so the list can never drift from stock. */
function getMockCategories() {
  var seen = {};
  var out = [];
  getMockInventory().forEach(function (item) {
    if (!seen[item.category]) {
      seen[item.category] = true;
      out.push(item.category);
    }
  });
  out.sort();
  return out;
}

/**
 * Mock customers. Fictional names, reserved 555-01xx numbers, placeholder
 * history. No real customer record is represented here.
 */
function getMockCustomers() {
  return [
    {
      customerId: 'CUST-2041',
      name: 'Denise Arceneaux',
      phone: '(504) 555-0142',
      email: 'demo.customer1@example.com',
      since: '2023-04-11',
      notes: 'Prefers weekend delivery. [ MOCK NOTE ]',
      history: [
        { date: '2025-11-02', itemId: 'EDP-09877', summary: 'Whirlpool Dryer WED4815EW', total: 349.00, warranty: '90-Day Extended' },
        { date: '2024-06-18', itemId: 'EDP-08120', summary: 'Frigidaire Range FCRE3052AS', total: 465.00, warranty: '30-Day Standard' }
      ],
      warrantyClaims: [
        { date: '2025-11-21', itemId: 'EDP-09877', status: 'RESOLVED', detail: 'Heating element replaced under 90-day. [ MOCK ]' }
      ]
    },
    {
      customerId: 'CUST-2088',
      name: 'Marcus Boudreaux',
      phone: '(985) 555-0188',
      email: 'demo.customer2@example.com',
      since: '2025-01-27',
      notes: 'Contractor — buys in pairs. [ MOCK NOTE ]',
      history: [
        { date: '2026-03-09', itemId: 'EDP-10011', summary: 'Maytag Washer MVWC465HW', total: 419.00, warranty: '30-Day Standard' }
      ],
      warrantyClaims: []
    },
    {
      customerId: 'CUST-2115',
      name: 'Tyra Washington',
      phone: '(504) 555-0119',
      email: 'demo.customer3@example.com',
      since: '2026-07-30',
      notes: 'New customer. [ MOCK NOTE ]',
      history: [],
      warrantyClaims: []
    }
  ];
}

/**
 * Mock activity/audit timeline. Ordered newest-first by the client.
 * `kind` drives the icon + accent. `before`/`after` render as a change pair;
 * `detail` renders as a single line. `status` and `reason` are optional.
 */
function getMockActivity() {
  return [
    { id: 'EV-001', kind: 'TRANSACTION_CREATED', minutesAgo: 46, user: 'Taylor D.', action: 'Transaction created', detail: 'Draft ticket TXN-MOCK-4471 opened at Register 1', status: 'OK' },
    { id: 'EV-002', kind: 'CUSTOMER_LINKED', minutesAgo: 44, user: 'Taylor D.', action: 'Customer linked', before: 'Walk-in (unassigned)', after: 'Denise Arceneaux — CUST-2041', status: 'OK' },
    { id: 'EV-003', kind: 'ITEM_ADDED', minutesAgo: 41, user: 'Taylor D.', action: 'Item added to cart', detail: 'EDP-10241 — Whirlpool WRS325SDHZ @ $749.00', status: 'OK' },
    { id: 'EV-004', kind: 'ITEM_ADDED', minutesAgo: 39, user: 'Taylor D.', action: 'Item added to cart', detail: 'EDP-10190 — Maytag MEDC465HW @ $399.00', status: 'OK' },
    { id: 'EV-005', kind: 'PRICE_CHANGED', minutesAgo: 33, user: 'Taylor D.', action: 'Price override', before: '$749.00', after: '$699.00', reason: 'Owner approval — minor door dent', status: 'APPROVED' },
    { id: 'EV-006', kind: 'WARRANTY_SELECTED', minutesAgo: 28, user: 'Jasmine R.', action: 'Warranty selected', before: '30-Day Standard', after: '90-Day Extended (+$49.00)', reason: 'Customer requested upgrade', status: 'OK' },
    { id: 'EV-007', kind: 'OFFLINE_QUEUED', minutesAgo: 22, user: 'system', action: 'Offline queue engaged', detail: '2 pending writes held locally — network unreachable', status: 'QUEUED', reason: 'Shop Wi-Fi dropped' },
    { id: 'EV-008', kind: 'SYNC_COMPLETED', minutesAgo: 19, user: 'system', action: 'Sync completed', before: '2 queued', after: '0 queued', status: 'SYNCED' },
    { id: 'EV-009', kind: 'PAYMENT_RECORDED', minutesAgo: 14, user: 'Taylor D.', action: 'Payment recorded', detail: 'CASH — $1,201.35 tendered, $0.00 change', status: 'OK' },
    { id: 'EV-010', kind: 'INVENTORY_SOLD', minutesAgo: 12, user: 'system', action: 'Inventory marked sold', before: 'AVAILABLE (qty 3)', after: 'SOLD (qty 2)', detail: 'EDP-10430 — LG LTCS20020S', status: 'OK' },
    { id: 'EV-011', kind: 'RECEIPT_PRINTED', minutesAgo: 10, user: 'Taylor D.', action: 'Receipt printed', detail: 'Counter thermal printer — 1 copy', status: 'OK' },
    { id: 'EV-012', kind: 'RECEIPT_EMAILED', minutesAgo: 9, user: 'Taylor D.', action: 'Receipt emailed', detail: 'Sent to customer on file', status: 'SENT' },
    { id: 'EV-013', kind: 'PRINTER_STATUS', minutesAgo: 4, user: 'system', action: 'Printer status changed', before: 'READY', after: 'UNAVAILABLE', reason: 'Paper out — front counter unit', status: 'ATTENTION' }
  ];
}

/** Mock cart the shell opens with, so the checkout panel is reviewable. */
function getMockOpenTicket() {
  return {
    ticketId: 'TXN-MOCK-4471',
    register: 'Register 1',
    cashier: 'Taylor D.',
    customerId: 'CUST-2041',
    lines: [
      { itemId: 'EDP-10241', qty: 1, priceOverride: 699.00, warrantyId: 'W-90' },
      { itemId: 'EDP-10190', qty: 1, priceOverride: null, warrantyId: 'W-30' }
    ],
    paymentMethodId: 'CASH'
  };
}
