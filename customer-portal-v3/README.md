# EDP Customer Portal V3

Status: TEST foundation only — not LIVE.

## Product definition
Mobile-first public web app for The Electronics Depot LLC. Customers can browse without an account. Future customer login/secure-link access is additive and must never block the public storefront.

## Phase 1 public experience
- Home
- Shop appliances
- Repair / service
- Parts requests
- Warranty information
- Delivery information
- Contact / call / text
- Privacy Policy
- Terms & Conditions
- SMS consent information

## Phase 1 architecture — Apps Script first, migration-ready
Browser -> Google Apps Script V3 web app -> dedicated public-safe API -> EDP_MASTER_DATABASE.

EDP_MASTER_DATABASE remains the source of truth. This project does not create a duplicate inventory, customer, sales, repair, warranty, or accounting database.

The customer-facing frontend stays plain HTML/CSS/JavaScript with one transport adapter (`PortalAPI`). UI code must not directly read Sheets or scatter `google.script.run` calls throughout the app. If Firebase Hosting is adopted later, replace the transport adapter rather than rebuilding the screens.

Firebase/Cloud Run are deferred until a measurable requirement justifies them (true custom-domain hosting, heavier authenticated customer features, higher concurrency, or backend workloads Apps Script cannot handle cleanly).

## Environment policy
TEST -> STAGING -> LIVE.

This branch is TEST only. Do not connect production credentials, production Twilio messaging, production write access, or production domain routing until staging review passes.

## Public-data rule
Only explicit customer-safe fields may leave the backend. Never expose acquisition cost, cost basis, vendor information, margin, internal repair notes, employee notes, private customer data, accounting data, or credentials.

## Phase 1 data boundary
`EDP_Customer_Portal_API.gs` is the only public inventory data boundary. It whitelists output fields. Internal APIs must never be reused for public responses.

## Next build steps
1. Create / connect the dedicated Apps Script TEST project or TEST deployment.
2. Set the `EDP_MASTER_DATABASE_ID` Script Property; do not hard-code it in source.
3. Verify the APPLIANCES sheet headers against the public whitelist.
4. Connect the mobile storefront to `api_getPublicAppliances()`.
5. Finalize Privacy Policy, Terms, SMS Terms, and consent logging before LIVE publication.
6. Add repair and parts request forms after read-only inventory is validated.
7. Promote through TEST -> STAGING -> LIVE only after review.

## Deferred hosting reference
The original Firebase prototype files remain in this branch as design/reference material only. They are not an approved Phase 1 deployment target.
