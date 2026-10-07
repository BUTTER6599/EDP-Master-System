/**
 * Config.gs — NON-SECRET TEST CONSTANTS ONLY
 * The Electronics Depot LLC — EDP OS Register (clean rebuild)
 *
 * SAFETY CONTRACT FOR THIS FILE:
 *   - No API keys, tokens, passwords, PINs, or secrets. Ever.
 *   - No LIVE spreadsheet IDs, Drive folder IDs, or database IDs.
 *   - Nothing here is read at load time by any mutating routine.
 *
 * Anything that eventually needs a real ID or credential must come from
 * Script Properties at a later, deliberate build pass — not from this file.
 */

var CONFIG = {
  // --- Identity -----------------------------------------------------------
  APP_NAME: 'EDP OS Register',
  COMPANY_NAME: 'The Electronics Depot LLC',
  COMPANY_SHORT: 'Electronics Depot',

  // --- Environment --------------------------------------------------------
  // TEST is the only supported value in this build. The UI reads this to
  // paint the persistent TEST MODE banner. Do not flip this to LIVE until a
  // real data layer exists and has been reviewed.
  ENVIRONMENT: 'TEST',
  BUILD_LABEL: 'Clean Shell — Pass 1 (UI only)',
  BUILD_VERSION: '0.1.0',

  // --- Locale / time ------------------------------------------------------
  TIMEZONE: 'America/Chicago',
  LOCALE: 'en-US',
  CURRENCY: 'USD',

  // --- Sales tax ----------------------------------------------------------
  // APPROVED EDP RETAIL TAX POLICY (owner decision, 2026-10-03). This closes
  // NV-1.
  //
  // EDP advertised and selling prices are TAX-INCLUSIVE. The price shown on
  // an item IS what the customer pays. Tax is NEVER added on top; it is
  // extracted from the total that is already displayed:
  //
  //     tax            = total - (total / (1 + RATE))
  //     pre-tax amount = total - tax
  //
  // So a $300.00 advertised appliance is a $300.00 customer total, of which
  // $26.65 is tax and $273.35 is the pre-tax taxable amount.
  //
  // Authority for the rate:
  //     Louisiana state general sales tax        5.00%
  //     Jefferson Parish general merchandise     4.75%
  //     combined general rate                    9.75%
  //
  // The previous MOCK_TAX_RATE of 9.45% is RETIRED and DELETED, not commented
  // out, so it cannot be reinstated by uncommenting a line. It was never an
  // EDP rate: it appears nowhere in the historical SALES data, and it was
  // applied additively, which no historical EDP sale does.
  //
  // This object is the ONLY place a tax rate exists in the whole build. The
  // client holds no rate of its own and derives everything from here.
  SALES_TAX: {
    MODE: 'INCLUSIVE',
    RATE: 0.0975,
    LABEL: 'Sales Tax (9.75%, included)',
    COMPONENTS: [
      { authority: 'Louisiana (state)', rate: 0.0500 },
      { authority: 'Jefferson Parish', rate: 0.0475 }
    ],
    AUTHORITY_NOTE: 'Owner policy decision 2026-10-03. Louisiana 5.00% + ' +
      'Jefferson Parish 4.75% = 9.75% combined general rate, applied ' +
      'TAX-INCLUSIVE to EDP retail selling prices.'
  },

  // --- Receipt header placeholders ---------------------------------------
  // Deliberate placeholders. Do not substitute real store details until the
  // receipt writer is a real, reviewed feature.
  STORE_ADDRESS_PLACEHOLDER: '[ STORE ADDRESS PLACEHOLDER ]',
  STORE_PHONE_PLACEHOLDER: '[ STORE PHONE PLACEHOLDER ]',
  STORE_FOOTER_PLACEHOLDER: '[ RETURN / WARRANTY POLICY TEXT PLACEHOLDER ]',

  // --- Feature flags ------------------------------------------------------
  // Every write-path capability is OFF and stays OFF in this pass. The UI
  // renders the controls so the layout can be reviewed, but they are inert.
  FEATURES: {
    COMPLETE_SALE_ENABLED: false,   // Complete Sale button is hard-disabled
    SALES_WRITER_ENABLED: false,    // no SALES sheet writes
    INVENTORY_MUTATION_ENABLED: false, // no inventory status changes
    PRINTER_ENABLED: false,         // no real printer calls
    EMAIL_RECEIPT_ENABLED: false,   // no MailApp / GmailApp
    OFFLINE_DB_ENABLED: false,      // no persistent offline store yet
    LIVE_DATABASE_ENABLED: false    // no EDP_MASTER_DATABASE access
  },

  // --- Warranty options (mock catalog) -----------------------------------
  WARRANTY_OPTIONS: [
    { id: 'W-ASIS', label: 'As-Is / No Warranty', days: 0, price: 0 },
    { id: 'W-30', label: '30-Day Standard', days: 30, price: 0 },
    { id: 'W-90', label: '90-Day Extended', days: 90, price: 49 },
    { id: 'W-365', label: '1-Year Premium', days: 365, price: 129 }
  ],

  // --- Payment methods (mock) --------------------------------------------
  // CASH is first and is the visible default per owner requirement.
  PAYMENT_METHODS: [
    { id: 'CASH', label: 'Cash', isDefault: true },
    { id: 'CARD', label: 'Card' },
    { id: 'FINANCE', label: 'Financing' },
    { id: 'LAYAWAY', label: 'Layaway' },
    { id: 'CHECK', label: 'Check' }
  ]
};

/**
 * Returns a client-safe copy of config. Nothing here is sensitive, but this
 * keeps a single, reviewable boundary for what crosses to the browser.
 */
function getClientConfig() {
  return {
    appName: CONFIG.APP_NAME,
    companyName: CONFIG.COMPANY_NAME,
    companyShort: CONFIG.COMPANY_SHORT,
    environment: CONFIG.ENVIRONMENT,
    buildLabel: CONFIG.BUILD_LABEL,
    buildVersion: CONFIG.BUILD_VERSION,
    timezone: CONFIG.TIMEZONE,
    locale: CONFIG.LOCALE,
    currency: CONFIG.CURRENCY,
    taxMode: CONFIG.SALES_TAX.MODE,
    taxRate: CONFIG.SALES_TAX.RATE,
    taxLabel: CONFIG.SALES_TAX.LABEL,
    taxComponents: CONFIG.SALES_TAX.COMPONENTS,
    storeAddress: CONFIG.STORE_ADDRESS_PLACEHOLDER,
    storePhone: CONFIG.STORE_PHONE_PLACEHOLDER,
    storeFooter: CONFIG.STORE_FOOTER_PLACEHOLDER,
    features: CONFIG.FEATURES,
    warrantyOptions: CONFIG.WARRANTY_OPTIONS,
    paymentMethods: CONFIG.PAYMENT_METHODS
  };
}
