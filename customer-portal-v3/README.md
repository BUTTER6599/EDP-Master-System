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

## Architecture
Browser -> Firebase Hosting -> same-origin /api/* -> Cloud Run or Firebase Functions -> approved EDP data sources.

Apps Script remains an internal automation/workflow layer. EDP_MASTER_DATABASE remains the source of truth; no duplicate inventory/customer/sales/repair/warranty database is introduced by this project.

## Environment policy
TEST -> STAGING -> LIVE.

This branch is TEST only. Do not connect production credentials, production Twilio messaging, production write access, or a production custom domain until the staging review passes.

## Public-data rule
Only explicit customer-safe fields may leave the backend. Never expose acquisition cost, cost basis, vendor information, margin, internal repair notes, employee notes, private customer data, accounting data, or credentials.

## Next build steps
1. Verify Firebase project / Hosting target.
2. Verify production domain and DNS owner before changing DNS.
3. Finalize Privacy Policy, Terms, and SMS consent language.
4. Build read-only public inventory API with an explicit response whitelist.
5. Connect storefront inventory cards to the API.
6. Add repair and parts request forms.
7. Promote through TEST -> STAGING -> LIVE only after review.
