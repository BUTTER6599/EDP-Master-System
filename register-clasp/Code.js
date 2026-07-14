// ============================================================
//  EDP REGISTER — Code.gs
//  doGet router — serves Register.html as the web app
// ============================================================

function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile('Register')
    .setTitle('EDP Register v2.1.0')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}