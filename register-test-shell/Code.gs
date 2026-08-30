/**
 * Code.gs — server entry point
 * The Electronics Depot LLC — EDP OS Register (clean rebuild, TEST ONLY)
 *
 * SAFETY CONTRACT FOR THIS FILE:
 *   - No SpreadsheetApp, DriveApp, MailApp, GmailApp, UrlFetchApp, or
 *     PropertiesService calls anywhere in this build.
 *   - doGet() performs no mutation of any kind. Nothing is created,
 *     migrated, or repaired on page load.
 *   - Every exported function below is READ-ONLY and returns mock data.
 *   - There is no sales writer, no inventory mutation, no printer bridge,
 *     and no mail sender in this pass. Those are deliberate omissions.
 */

/**
 * Web app entry point. Renders the shell only.
 * No spreadsheet is opened, no schema is created, nothing is written.
 */
function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  // Injected as a pre-escaped JSON string so the shell renders fully on the
  // first paint. Read-only payload; see getBootstrap().
  template.bootJson = getBootstrapJson();

  return template
    .evaluate()
    .setTitle(CONFIG.APP_NAME + ' — ' + CONFIG.ENVIRONMENT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Bootstrap payload as a JSON string, with `<` escaped so the value is safe
 * to print inside a <script> block. Read-only.
 */
function getBootstrapJson() {
  return JSON.stringify(getBootstrap()).replace(/</g, '\\u003c');
}

/** Template include helper for Styles.html / Scripts.html. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Single read-only payload the client boots from.
 * Everything in here comes from Config.gs and MockData.gs. No I/O.
 */
function getBootstrap() {
  return {
    config: getClientConfig(),
    inventory: getMockInventory(),
    categories: getMockCategories(),
    customers: getMockCustomers(),
    activity: getMockActivity(),
    openTicket: getMockOpenTicket(),
    serverTime: getServerTimeInfo()
  };
}

/**
 * Read-only clock reference. The client runs its own ticking clock in
 * America/Chicago via Intl; this exists so the UI can show whether the
 * device drifted from the server. No side effects.
 */
function getServerTimeInfo() {
  var now = new Date();
  return {
    iso: now.toISOString(),
    epochMs: now.getTime(),
    timezone: CONFIG.TIMEZONE
  };
}

/**
 * Deliberately unimplemented in this pass. Kept as named stubs so nobody
 * wires a half-built write path into the UI by accident, and so a future
 * pass has an obvious, reviewable place to start.
 *
 * Each throws rather than silently no-oping.
 */
function completeSale_NOT_IMPLEMENTED() {
  throw new Error('completeSale is not implemented in the TEST shell (pass 1). ' +
    'The real SALES writer is a separate, reviewed build step.');
}

function markInventorySold_NOT_IMPLEMENTED() {
  throw new Error('Inventory mutation is not implemented in the TEST shell (pass 1).');
}

function printReceipt_NOT_IMPLEMENTED() {
  throw new Error('Printer integration is not implemented in the TEST shell (pass 1).');
}

function emailReceipt_NOT_IMPLEMENTED() {
  throw new Error('Receipt email is not implemented in the TEST shell (pass 1).');
}
