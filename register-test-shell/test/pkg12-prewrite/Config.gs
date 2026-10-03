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

  // --- Mock financials ----------------------------------------------------
  // MOCK ONLY. This is a placeholder rate for visual layout of the cart and
  // receipt. It is NOT the filed rate and must not be used for real sales.
  MOCK_TAX_RATE: 0.0945,
  MOCK_TAX_LABEL: 'Sales Tax (MOCK)',

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
    taxRate: CONFIG.MOCK_TAX_RATE,
    taxLabel: CONFIG.MOCK_TAX_LABEL,
    storeAddress: CONFIG.STORE_ADDRESS_PLACEHOLDER,
    storePhone: CONFIG.STORE_PHONE_PLACEHOLDER,
    storeFooter: CONFIG.STORE_FOOTER_PLACEHOLDER,
    features: CONFIG.FEATURES,
    warrantyOptions: CONFIG.WARRANTY_OPTIONS,
    paymentMethods: CONFIG.PAYMENT_METHODS
  };
}
