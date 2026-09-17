<#
    Deploy-TestShell.ps1 — RETIRED

    The Electronics Depot LLC — EDP OS Register

    This script no longer performs any action. It exists only so that anyone
    who reaches for the historical deployment path gets an explicit STOP
    rather than a missing-file mystery.

    WHY IT WAS RETIRED
      The historical implementation copied a hard-coded list of files that
      described the OLD 7-file TEST shell:
        appsscript.json, Code.gs, Config.gs, MockData.gs,
        Index.html, Styles.html, Scripts.html
      The current Register is a 10-file Apps Script source set. The list was
      never updated when DataSource.gs, Validation.gs and InventoryQuery.gs
      were added, while .claspignore was updated three times. The two
      silently diverged.

      Because Code.gs calls readInventory(), readCategories(),
      readCustomers(), readActivity() and readOpenTicket() — all defined in
      DataSource.gs — running the old script would have pushed a Code.gs
      whose dependency was absent, leaving the TEST Apps Script project
      throwing "readInventory is not defined" on every page load.

      The script looked safe. It had Script ID verification, a refuse-list
      for the old Register project, a typed confirmation, a hash check and a
      read-back. That appearance of safety is precisely why it was dangerous.

    WHAT REPLACES IT
      Nothing yet, deliberately. The EDP OS TEST synchronization workflow has
      not been approved. It cannot be designed responsibly until the real
      Apps Script platform facts are verified against the TEST project —
      among them whether a working /dev test URL requires a webapp manifest
      block, and whether google.script.run reaches the server functions at
      all.

    TO REVIEW THE RETIRED IMPLEMENTATION
      It remains in Git history. For example:
        git log --oneline -- register-test-shell/Deploy-TestShell.ps1
        git show <commit>:register-test-shell/Deploy-TestShell.ps1

    THIS FILE PERFORMS NO FILE COPIES, NO CLASP COMMANDS, NO GOOGLE ACCESS
    AND NO APPS SCRIPT ACCESS. It contains no credentials and no tokens.
#>

Write-Host ''
Write-Host '================================================================' -ForegroundColor Red
Write-Host ' STOP - THIS DEPLOYMENT SCRIPT IS RETIRED.' -ForegroundColor Red
Write-Host '================================================================' -ForegroundColor Red
Write-Host ''
Write-Host ' The historical implementation supported the old 7-file TEST'
Write-Host ' shell and is unsafe for the current 10-file Register'
Write-Host ' architecture.'
Write-Host ''
Write-Host ' Do not use this script to synchronize Apps Script.'
Write-Host ''
Write-Host ' The replacement EDP OS TEST synchronization workflow has not'
Write-Host ' yet been approved.'
Write-Host ''
Write-Host ' Refer to Git history if the retired implementation must be'
Write-Host ' reviewed:'
Write-Host '   git log --oneline -- register-test-shell/Deploy-TestShell.ps1'
Write-Host ''
Write-Host ' No files were copied. No clasp command was run. No Google or'
Write-Host ' Apps Script access was attempted.'
Write-Host ''
Write-Host '================================================================' -ForegroundColor Red
Write-Host ''

exit 1
