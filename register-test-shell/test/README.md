# EDP Register — local test harness

Runs every reproducible check against the real Apps Script source files in
`register-test-shell/`.

**Nothing here touches Google, Apps Script, a spreadsheet, EDP_MASTER_DATABASE,
or the network.** No authentication is required or possible.

## Run

```bash
cd register-test-shell/test
npm install      # one dev dependency: playwright (for the browser suite)
npm test
```

Individual suites:

```bash
npm run test:validator   # Phase 2 shape validator
npm run test:query       # Phase 3A query contract
npm run test:parity      # ordered-parity analysis
npm run test:browser     # five-viewport headless Chromium regression
npm run build:preview    # assemble the page without rendering it
```

Test artifacts (`preview.html`, screenshots) are written **outside the
repository**, to a temp directory, so a run never dirties the working tree.
Override with `EDP_TEST_OUT=/some/path`.

## Layout

```
test/
  run-all.cjs             aggregate runner, prints the summary
  package.json            test scripts + the playwright dev dependency
  run/                    RUNNABLE suites
    validator-tests.cjs   Phase 2 shape validation
    query-tests.cjs       Phase 3A query contract (the 97-test suite)
    ordered-parity.cjs    ordered-parity analysis
    build-preview.cjs     HtmlService template resolver + server evaluator
    browser-regression.cjs five-viewport Chromium regression
    outdir.cjs            resolves the out-of-repo artifact directory
  recovery-snapshot/      PRESERVED EVIDENCE — do not edit
```

## Relationship to `recovery-snapshot/`

`recovery-snapshot/` holds the original harnesses exactly as they existed when
the Phase 2 and Phase 3A results were accepted. They are evidence and are
preserved byte-for-byte. They carry absolute paths from a disposable
environment and are **not** runnable from the repository.

Each file in `run/` is derived from its counterpart in `recovery-snapshot/` and
**differs by exactly one line** — path resolution. No test logic was altered,
so the behaviour under test is the behaviour that was accepted. Each derived
file carries a provenance header naming its source.

If you change a suite, change the copy in `run/`. Never edit
`recovery-snapshot/`.

## What the suites cover

**Phase 2 — shape validator (26 assertions).** Accepts the full mock dataset;
rejects missing `itemId`, a string price, `NaN`, negative `qty`, an unknown
availability code, a missing customer name or id, a non-array history, a string
history total, a missing `minutesAgo` or `kind`, malformed ticket lines, a
non-array dataset and a null record. Fails closed — never repairs.

**Phase 3A — query contract (97 assertions).** Paging (first, second, last
partial, past-end), search, category and availability filters, combined
filters, default limit, the echoed normalised query, deterministic repeats,
source-order invariance across five permutations, unknown-option rejection,
explicit empty-availability rejection, the duplicate-`itemId` paging invariant,
input-type rejection, and a 99-combination parity sweep against the current
client filter.

**Ordered parity.** Reports set parity (99/99) and ordered parity (83/99). The
16 ordering differences are the accepted, intentional Phase 3B behaviour
change — the canonical `category, brand, model, itemId` order replaces
MockData source order. This suite is analysis, not pass/fail.

**Browser regression.** Renders the real page at 1440/1366/1024/800/390 and
asserts 0 JavaScript errors, 0 external network requests, 16/16 local
`data:` images, 12 cards, cart total, CASH default, timeline growth, status
chips, and that Complete Sale stays disabled through a full interaction pass.

## Skips

The browser suite is **skipped, not failed**, if Playwright or Chromium is
unavailable. A skip is reported as a skip.
