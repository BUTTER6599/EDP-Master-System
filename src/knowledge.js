// Electronics Depot business knowledge base — shared across all agents
export const knowledgeBase = `
BUSINESS INFORMATION
Name: The Electronics Depot (Appliances, Parts & Service)
Address: 7333 Airline Drive, Metairie, Louisiana 70003
Phone: (504) 342-4004
Hours: Monday–Saturday, 10:00 AM – 5:00 PM (CLOSED SUNDAY)
Payment: Cash only — no cards, no checks, no exceptions
Tax: Used appliance prices INCLUDE tax. Tax applies only to add-ons (parts, delivery, accessories).

APPLIANCE TESTING WINDOW (in-store only)
This is when customers can come in to see an appliance run before they take it home, or to verify an appliance after a repair.
Most days: 11:30 AM – 3:30 PM.
On good-weather days with no power issues: 10:30 AM – 3:30 PM.
We never test appliances at the customer's home.

APPLIANCE INVENTORY & PRICING
We sell used/refurbished appliances. Prices are approximate and change with inventory.
- Refrigerators: $265–$495
- Dryers: $135–$395
- Stoves/Ranges: $165–$395
- Washer/Dryer Sets: $395–$695
Brands we carry: GE, Whirlpool, Kenmore, Roper, Amana, Maytag, KitchenAid, Admiral, Hotpoint, Frigidaire

WARRANTY
- 30 days on all used appliances.
- Must be brought back to the store. We do NOT do in-home warranty service.

REPAIR / DROP-OFF SERVICE
- In-store diagnostic: free when the appliance is dropped off.
- Standard service turnaround: 2–4 business days.
- Storage fee: $9 per day after the 2-day pickup window expires.
- Drop-off: anytime during store hours. Customer brings their own help to load and unload.
- Never lay appliances down — this includes stoves, washers, dryers, and refrigerators. If a customer lays one down anyway, the customer handles loading and unloading themselves.
- We do NOT offer in-home service, mobile repair, or emergency same-day service.

DELIVERY (within 25 miles of 7333 Airline Drive, Metairie)

Pricing tiers (starting point — will be refined later with neighborhood-specific rates):
- 0 to 5 miles: $40
- 5 to 10 miles: $50
- 10 to 15 miles: $65
- 15 to 20 miles: $85
- 20 to 25 miles: quote on request
- Over 25 miles: NOT eligible

Delivery hours:
- Monday through Thursday: 10:30 AM – 1:00 PM
- Friday: 10:30 AM – 12:30 PM
- Saturday: 10:30 AM – 12:30 PM
- Sunday: closed (special exceptions only — see Sunday Delivery rule below)

Delivery scheduling rules:
- Stops 0 to 12 miles away: can be scheduled up to 1:00 PM (Monday through Thursday only) if drive time is under 15 minutes.
- Stops 12+ miles away: must be scheduled before 12:30 PM.
- All deliveries: cash paid in full BEFORE the truck leaves the shop.
- Outside-only ground-level drop at the front door.
- NO HAND TRUCK USE — we don't lend ours, we don't help past ground level.
- The customer must have their own help and equipment to move it inside.
- Driver waits a maximum of 10 minutes at the delivery address. If no one is available to receive, delivery is forfeited and the customer must reschedule (no refund).
- Someone 20 years or older with valid ID must be present to receive delivery.
- We do NOT disconnect old appliances, NOT reconnect new ones, and NOT haul away old units. The customer handles all hookup, disconnect, and disposal themselves.
If a customer asks about any of these rules, state the rule clearly and do not negotiate.

Delivery areas (within 25 miles):
- All of Metairie (including Old Metairie, Bucktown), Kenner, Harahan, River Ridge, Elmwood, Waggaman, Avondale, Bridge City, Jefferson.
- Most of New Orleans: New Orleans East, Gentilly, Mid-City, Uptown, Lakeview, Algiers.
- West Bank: Westwego, Marrero, Gretna, Terrytown, Harvey, Belle Chasse.
- East: Chalmette, Arabi, Violet.
- Outer reach: parts of Slidell, LaPlace, Luling, Boutte.
- French Quarter: special rules — see French Quarter rule below.

NOT a delivery zone:
- Slidell proper, Mandeville, Covington — anything across the Causeway (24-mile bridge).
- Anything across the Twin Spans (I-10 east bridge to the North Shore).
- Anything beyond 25 miles.
- Cross-bridge to the North Shore is a special "mystery" delivery only — by exception, not advertised.

FRENCH QUARTER SPECIAL RULES
The French Quarter is a NO-DELIVERY zone by default. Exceptions only when ALL of these are true:
- Outside-only ground-level drop.
- Day must be Monday, Tuesday, or Wednesday MORNING.
- NOT a holiday.
- NO events scheduled in the Quarter that day (Mardi Gras, Jazz Fest, French Quarter Fest, Halloween, New Year's, parades, etc.).
Suggested phrasing for the caller:
"The French Quarter is tricky — we only deliver there Monday, Tuesday, or Wednesday mornings, outside drop-off only, no holidays, no event days. I can take your address and date and confirm if we can do it."

INSIDE / UP-STAIRS DELIVERY (we do not do this)
We do NOT do inside delivery or carry up stairs. If a customer needs inside placement, refer them to Mr. Ray — an outside service that starts at $60. We do not coordinate, schedule, or know his availability. We just give the customer his info to call directly.
Suggested phrasing for the caller:
"We only drop ground-level outside at the front door — we don't do inside or stairs. But Mr. Ray is an outside service that starts at $60 and can help with that. We'd give you his info to call directly."

SUNDAY DELIVERY (special exception)
Sunday delivery may be possible 11:00 AM – 2:00 PM only if we decide we have availability that day. NOT guaranteed. Must be pre-arranged.
Suggested phrasing for the caller:
"We're closed Sunday, but Sunday delivery between 11 and 2 may be possible if we have availability that day — it has to be pre-arranged and isn't guaranteed. Want me to take your info and have someone confirm if we can do it?"

DO NOT SERVICE list (FUTURE — not built yet)
A separate DO_NOT_SERVICE tab in the master sheet will hold customers and addresses that are blocked from delivery. The AI should check this list before quoting any delivery. Not implemented yet — flag for future phase.

220V PLUG CORDS
- Free with any appliance purchase of $295 or more.
- Otherwise: $25 used / $35 new (plus tax).
- Before we match a cord, the customer must send a clear, well-lit photo showing every hole inside their wall socket OR bring in their old plug.

GAS APPLIANCES
No 220V plug needed — the plug is built in.

ACCESSORIES ($20 each, plus tax)
- Dryer vent
- Dryer vent pipe
- Washer water hose

TRADE-IN POLICY
We accept trade-ins on select appliances in working or repairable condition.
We do NOT accept:
- Samsung or LG appliances (any type)
- Front-load washers (any brand)
- Side-by-side refrigerators (any brand)
- French door refrigerators (any brand)
- Amana or Whirlpool refrigerators
If the caller's appliance is on the not-accepted list, let them know politely.

LOYALTY PROGRAM (discount tiers based on purchase history)
- Tier 1: 5% off
- Tier 2: 10% off
- Tier 3: 20% off
- Tier 4: 30% off
Military and first responders: 10% off (must show ID in store).

PURCHASE POLICIES (all sales final)
- No refunds under any circumstances.
- All deposits are non-refundable.
- Appliances must be picked up within 2 days of purchase or storage fees begin ($9/day).
- Customers arrange their own transport unless they purchase delivery.
- We are not responsible for damage after the appliance leaves the store or after delivery is accepted.
- Sold as-is unless a written service agreement is provided at time of sale.
`.trim();
