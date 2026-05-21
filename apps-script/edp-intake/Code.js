// ============================================================
// Code.gs - EDP Intake
// Version: v1.0.0
// Date:    2026-05-10
// Web app entry point. Renders Intake.html.
// ES5 only. ASCII only.
// ============================================================

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Intake');
  var out = t.evaluate();
  out.setTitle('EDP Intake');
  out.addMetaTag('viewport',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return out;
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function api_logout() {
  return {ok: true};
}
