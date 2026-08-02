<#
  Gautam Talks — subscriber admin
  ================================
  There is deliberately NO web admin panel. Any admin endpoint is a new door
  with a new lock to pick, reachable by the whole internet forever. This script
  runs locally and authenticates through Wrangler, which is tied to your
  Cloudflare account and protected by your 2FA. Attack surface: zero.

  Usage:
    .\admin.ps1              # dashboard
    .\admin.ps1 -Export      # write confirmed emails to a local CSV
    .\admin.ps1 -Remove "someone@example.com"
    .\admin.ps1 -Health      # anomaly check
#>

param(
  [switch]$Export,
  [switch]$Health,
  [string]$Remove
)

$DB = "gautamtalks-subs"

function Query([string]$sql) {
  $raw = wrangler d1 execute $DB --remote --json --command="$sql" 2>$null
  if (-not $raw) { Write-Host "Query failed. Is wrangler logged in?" -ForegroundColor Red; exit 1 }
  return ($raw | ConvertFrom-Json)[0].results
}

if ($Remove) {
  # Honours a deletion request. Normalizes the address the same way the worker does.
  $addr = $Remove.Trim().ToLower()
  Write-Host "`nDeleting all records matching: $addr" -ForegroundColor Yellow
  $confirm = Read-Host "Type DELETE to confirm"
  if ($confirm -ne "DELETE") { Write-Host "Cancelled."; exit }
  Query "DELETE FROM subscribers WHERE email = '$($addr -replace "'","''")'" | Out-Null
  Write-Host "Done. Record removed." -ForegroundColor Green
  exit
}

Write-Host "`n===== GAUTAM TALKS - CLIMB LOG =====" -ForegroundColor Cyan

$stats = Query @"
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN confirmed = 1 THEN 1 ELSE 0 END) AS confirmed,
  SUM(CASE WHEN confirmed = 0 THEN 1 ELSE 0 END) AS pending,
  SUM(CASE WHEN confirmed = 1 AND confirmed_at > datetime('now','-7 days') THEN 1 ELSE 0 END) AS week,
  SUM(CASE WHEN created_at > datetime('now','-1 day') THEN 1 ELSE 0 END) AS today
FROM subscribers
"@

$s = $stats[0]
Write-Host ""
Write-Host ("  Confirmed subscribers : {0}" -f $s.confirmed) -ForegroundColor Green
Write-Host ("  Awaiting confirmation : {0}" -f $s.pending)
Write-Host ("  New this week         : {0}" -f $s.week)
Write-Host ("  New today             : {0}" -f $s.today)

# who they are, in aggregate only
Write-Host "`n  --- Audience mix (confirmed) ---" -ForegroundColor Cyan
$mix = Query "SELECT profile, COUNT(*) AS n FROM subscribers WHERE confirmed = 1 GROUP BY profile ORDER BY n DESC"
if ($mix) {
  foreach ($row in $mix) {
    $p = $row.profile | ConvertFrom-Json
    Write-Host ("  {0,-10} {1,-12} {2,-6} : {3}" -f $p.track, $p.goal, $p.depth, $row.n)
  }
} else { Write-Host "  (no confirmed subscribers yet)" }

if ($Health) {
  Write-Host "`n  --- Health check ---" -ForegroundColor Cyan

  # A healthy list confirms most signups. A low rate suggests bots or deliverability trouble.
  if ($s.total -gt 0) {
    $rate = [math]::Round(100 * $s.confirmed / $s.total, 1)
    $col = if ($rate -lt 40) { "Red" } elseif ($rate -lt 65) { "Yellow" } else { "Green" }
    Write-Host ("  Confirmation rate     : {0}%" -f $rate) -ForegroundColor $col
    if ($rate -lt 40) { Write-Host "    ! Low. Check spam placement, or suspect bot signups." -ForegroundColor Red }
  }

  # Sudden spikes are the signature of automated stuffing.
  $spike = Query "SELECT COUNT(*) AS n FROM subscribers WHERE created_at > datetime('now','-1 hour')"
  $n = $spike[0].n
  $col = if ($n -gt 20) { "Red" } elseif ($n -gt 8) { "Yellow" } else { "Green" }
  Write-Host ("  Signups in last hour  : {0}" -f $n) -ForegroundColor $col
  if ($n -gt 20) { Write-Host "    ! Unusual volume. Consider tightening Turnstile to Managed+." -ForegroundColor Red }

  # Stale unconfirmed rows should be near zero if the cron is running.
  $stale = Query "SELECT COUNT(*) AS n FROM subscribers WHERE confirmed = 0 AND created_at < datetime('now','-30 days')"
  Write-Host ("  Stale unconfirmed     : {0}" -f $stale[0].n) -ForegroundColor $(if ($stale[0].n -gt 0) { "Yellow" } else { "Green" })
  if ($stale[0].n -gt 0) { Write-Host "    ! Cleanup cron may not be running. Check: wrangler deployments list" -ForegroundColor Yellow }
}

if ($Export) {
  # Only confirmed addresses may ever be emailed (CASL).
  $rows = Query "SELECT email, confirmed_at FROM subscribers WHERE confirmed = 1 ORDER BY confirmed_at"
  $file = "subscribers.csv"   # .gitignore already blocks this filename
  "email,confirmed_at" | Out-File $file -Encoding utf8
  foreach ($r in $rows) { "$($r.email),$($r.confirmed_at)" | Out-File $file -Append -Encoding utf8 }
  Write-Host "`n  Exported $($rows.Count) confirmed addresses to $file" -ForegroundColor Green
  Write-Host "  This file contains personal data. Do not commit it, do not email it." -ForegroundColor Yellow
}

Write-Host "`n====================================`n" -ForegroundColor Cyan