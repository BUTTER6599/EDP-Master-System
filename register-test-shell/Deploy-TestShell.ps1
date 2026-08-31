<#
  Deploy-TestShell.ps1
  EDP OS Register — clean TEST shell, pass 1.

  Copies the shell files into the local TEST folder and pushes them to the
  TEST Apps Script project, refusing to do anything unless the target Script
  ID matches exactly.

  TEST ONLY. Creates no deployment. Never touches the old Register project.

  Usage (from anywhere):
      .\Deploy-TestShell.ps1 -Source "C:\path\to\repo\register-test-shell"

  Add -Force to skip the interactive confirmation before pushing.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $Source,

  [string] $Target = "C:\Users\Owner\EDP_Register_TEST_Clean",

  [switch] $Force
)

$ErrorActionPreference = 'Stop'

# --- The only Script ID this script will ever write to -----------------------
$TEST_SCRIPT_ID = '1Yk4bjqt8PXV7GCLwzJgdhtPQAiNTAwUtun3S865i67OOxnIKnmc_n87f'

# --- The project that must never be touched ---------------------------------
$OLD_SCRIPT_ID  = '1VeOcKP11K7B_BxnFKnjXLmB9jQA-j8wq-jEzpOH7M1gXt28NFTDhEe5P'

# --- Exactly what belongs in the Apps Script project ------------------------
$SHELL_FILES = @(
  'appsscript.json',
  'Code.gs',
  'Config.gs',
  'MockData.gs',
  'Index.html',
  'Styles.html',
  'Scripts.html',
  '.claspignore'
)

function Say  ($m) { Write-Host $m }
function Good ($m) { Write-Host "  OK    $m" -ForegroundColor Green }
function Warn ($m) { Write-Host "  WARN  $m" -ForegroundColor Yellow }
function Die  ($m) { Write-Host ""; Write-Host "  STOP  $m" -ForegroundColor Red; Write-Host ""; exit 1 }

Say ""
Say "=============================================================="
Say " EDP OS Register - TEST shell push"
Say " TEST ONLY. No deployment. No live data."
Say "=============================================================="

# ---------------------------------------------------------------------------
# STEP 1-2  Verify the target Script ID. Nothing else runs until this passes.
# ---------------------------------------------------------------------------
Say ""
Say "[1/8] Verifying target Script ID"

if (-not (Test-Path -LiteralPath $Target)) { Die "Target folder not found: $Target" }
Set-Location -LiteralPath $Target
Say "  Working directory: $(Get-Location)"

$claspPath = Join-Path $Target '.clasp.json'
if (-not (Test-Path -LiteralPath $claspPath)) {
  Die ".clasp.json not found in $Target. Nothing was copied or pushed."
}

$claspRaw = Get-Content -LiteralPath $claspPath -Raw
try   { $clasp = $claspRaw | ConvertFrom-Json }
catch { Die ".clasp.json is not valid JSON. Nothing was copied or pushed." }

$actualId = [string]$clasp.scriptId
Say "  Found scriptId: $actualId"

if ($actualId -ceq $OLD_SCRIPT_ID) {
  Die "This folder points at the OLD Register project. Refusing to continue."
}
if ($actualId -cne $TEST_SCRIPT_ID) {
  Die ("scriptId does not match the TEST project.`n" +
       "        expected: $TEST_SCRIPT_ID`n" +
       "        found:    $actualId`n" +
       "        Nothing was copied or pushed.")
}
Good "Script ID matches the TEST project exactly."

# Record a hash so we can prove .clasp.json was never modified.
$claspHashBefore = (Get-FileHash -LiteralPath $claspPath -Algorithm SHA256).Hash

# ---------------------------------------------------------------------------
# STEP 3  Confirm the source files are all present before touching anything.
# ---------------------------------------------------------------------------
Say ""
Say "[2/8] Checking source files"

if (-not (Test-Path -LiteralPath $Source)) { Die "Source folder not found: $Source" }

$missing = @()
foreach ($f in $SHELL_FILES) {
  if (-not (Test-Path -LiteralPath (Join-Path $Source $f))) { $missing += $f }
}
if ($missing.Count -gt 0) {
  Die ("Missing from source: " + ($missing -join ', ') + "`n        Nothing was copied.")
}
Good "All $($SHELL_FILES.Count) source files present."

# ---------------------------------------------------------------------------
# STEP 4  Back up .clasp.json, then copy. .clasp.json is never overwritten.
# ---------------------------------------------------------------------------
Say ""
Say "[3/8] Backing up .clasp.json"
$backup = Join-Path $Target (".clasp.json.backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Copy-Item -LiteralPath $claspPath -Destination $backup -Force
Good "Backed up to $(Split-Path $backup -Leaf)"

Say ""
Say "[4/8] Copying shell files into $Target"
foreach ($f in $SHELL_FILES) {
  $src = Join-Path $Source $f
  $dst = Join-Path $Target $f
  $existed = Test-Path -LiteralPath $dst
  Copy-Item -LiteralPath $src -Destination $dst -Force
  $size = (Get-Item -LiteralPath $dst).Length
  Say ("  {0,-20} {1,8} bytes  {2}" -f $f, $size, $(if ($existed) { 'overwritten' } else { 'new' }))
}
Good "$($SHELL_FILES.Count) files copied. .clasp.json.example and README.md were NOT copied."

# Prove the verified config survived the copy untouched.
$claspHashAfter = (Get-FileHash -LiteralPath $claspPath -Algorithm SHA256).Hash
if ($claspHashAfter -ne $claspHashBefore) { Die ".clasp.json changed during the copy. Restore from $backup." }
Good ".clasp.json unchanged (SHA256 matches pre-copy hash)."

# ---------------------------------------------------------------------------
# STEP 5  Show the resulting local file list.
# ---------------------------------------------------------------------------
Say ""
Say "[5/8] Local folder contents"
Get-ChildItem -LiteralPath $Target -Force -File |
  Sort-Object Name |
  Format-Table @{L='Name';E={$_.Name}}, @{L='Bytes';E={$_.Length}}, @{L='Modified';E={$_.LastWriteTime}} -AutoSize |
  Out-String | Write-Host

# ---------------------------------------------------------------------------
# STEP 6  Read-only status check. Informational — does not write anything.
# ---------------------------------------------------------------------------
Say "[6/8] clasp status (read-only)"
& npx clasp status
if ($LASTEXITCODE -ne 0) {
  Warn "clasp status exited with code $LASTEXITCODE."
  Warn "Older/newer clasp versions differ here. This is informational only;"
  Warn "review the file list above before continuing."
}

# ---------------------------------------------------------------------------
# STEP 7  Re-verify the Script ID, then push. No deployment is created.
# ---------------------------------------------------------------------------
Say ""
Say "[7/8] Push to the TEST project"

# Re-read from disk — never trust the earlier check after other commands ran.
$recheck = [string]((Get-Content -LiteralPath $claspPath -Raw | ConvertFrom-Json).scriptId)
if ($recheck -cne $TEST_SCRIPT_ID) { Die "scriptId changed since step 1. Refusing to push." }
Good "Script ID re-verified immediately before push."

if (-not $Force) {
  Say ""
  Say "  About to run: npx clasp push"
  Say "  Target: $TEST_SCRIPT_ID"
  Say "  This uploads 7 files. It does NOT create a deployment."
  $answer = Read-Host "  Type PUSH to continue (anything else aborts)"
  if ($answer -cne 'PUSH') { Die "Aborted at your request. Files were copied; nothing was pushed." }
}

Say ""
Say "  clasp may ask to overwrite the manifest (appsscript.json). Answer y —"
Say "  setting that manifest is the point of this push."
Say ""
& npx clasp push
$pushExit = $LASTEXITCODE

if ($pushExit -ne 0) {
  Die "clasp push FAILED with exit code $pushExit. Read the output above. Nothing else was attempted."
}
Good "clasp push reported success."

# ---------------------------------------------------------------------------
# STEP 8  Read the project back, without disturbing the working folder.
# ---------------------------------------------------------------------------
Say ""
Say "[8/8] Reading the project back to confirm what landed"

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("edp-readback-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  # A throwaway config pointing at the same TEST project, so clasp pull here
  # cannot overwrite anything in the real folder.
  @{ scriptId = $TEST_SCRIPT_ID; rootDir = '.' } | ConvertTo-Json |
    Set-Content -LiteralPath (Join-Path $tmp '.clasp.json') -Encoding utf8

  Push-Location $tmp
  & npx clasp pull
  $pullExit = $LASTEXITCODE
  Pop-Location

  if ($pullExit -ne 0) {
    Warn "Read-back pull exited with code $pullExit. Verify manually in the Apps Script editor."
  } else {
    Say ""
    Say "  Files now in the TEST Apps Script project:"
    Get-ChildItem -LiteralPath $tmp -Recurse -File |
      Where-Object { $_.Name -ne '.clasp.json' } |
      ForEach-Object { Say ("    {0,-22} {1,8} bytes" -f $_.Name, $_.Length) }

    $expected = @('appsscript.json','Code.gs','Config.gs','MockData.gs','Index.html','Styles.html','Scripts.html')
    $got = (Get-ChildItem -LiteralPath $tmp -Recurse -File | Where-Object { $_.Name -ne '.clasp.json' }).Name
    $absent = $expected | Where-Object { $_ -notin $got }
    Say ""
    if ($absent.Count -eq 0) { Good "All 7 expected files confirmed present in the project." }
    else { Warn ("NOT found in the project: " + ($absent -join ', ')) }
  }
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Say ""
Say "=============================================================="
Say " DONE"
Say "   Script ID pushed to : $TEST_SCRIPT_ID"
Say "   Old Register project: never referenced by this script"
Say "   Deployment created  : NO"
Say "   .clasp.json backup  : $(Split-Path $backup -Leaf)"
Say "=============================================================="
Say ""
