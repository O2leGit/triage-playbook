# Triage Playbook - one-shot deploy script
# Run from PowerShell in the project folder:
#   cd C:\Users\Chris\Documents\triage-playbook
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ''
Write-Host '=== Triage Playbook deploy ===' -ForegroundColor Cyan
Write-Host ''

# --- Credentials loaded from ikigaiOS-exec-ops .env ---
$envFile = 'C:\Users\Chris\Documents\ikigaiOS-exec-ops\.env'
if (-not (Test-Path $envFile)) { Write-Host "ERROR: .env not found at $envFile" -ForegroundColor Red; exit 1 }
$envVars = @{}
Get-Content $envFile | Where-Object { $_ -match '^\s*([^#=]+)=(.*)$' } | ForEach-Object {
    $k = $Matches[1].Trim(); $v = $Matches[2].Trim().Trim('"').Trim("'")
    $envVars[$k] = $v
}
$SUPABASE_URL     = $envVars['SUPABASE_URL']
$SUPABASE_ANON    = $envVars['SUPABASE_ANON_KEY']
$SUPABASE_SERVICE = $envVars['SUPABASE_SERVICE_ROLE_KEY']
$DATABASE_URL     = $envVars['DATABASE_URL']
$ANTHROPIC        = $envVars['ANTHROPIC_API_KEY']
$EMAIL_FROM       = 'noreply@ikigaios.com'

# ---------------------------------------------------------
# Step 1 - Check prerequisites
# ---------------------------------------------------------
Write-Host 'Step 1 - Checking prerequisites...' -ForegroundColor Yellow
function Need($cmd, $hint) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "MISSING: $cmd. $hint" -ForegroundColor Red; exit 1
    }
}
Need git 'Install Git from https://git-scm.com/'
Need node 'Install Node.js from https://nodejs.org/'
Need npm 'Comes with Node.js'
Need gh 'Install GitHub CLI from https://cli.github.com/ then run: gh auth login'
Write-Host '  ok' -ForegroundColor Green

# Netlify CLI - install if missing
if (-not (Get-Command netlify -ErrorAction SilentlyContinue)) {
    Write-Host 'Installing netlify-cli globally...' -ForegroundColor Yellow
    npm install -g netlify-cli
}

# ---------------------------------------------------------
# Step 2 - Run Supabase schemas via psql
# ---------------------------------------------------------
Write-Host ''
Write-Host 'Step 2 - Running Supabase schemas...' -ForegroundColor Yellow
$env:PGPASSWORD = 'cYTiCQUVuIC68z5b'
$pgHost = 'db.tfizrgevpajadduuzhdl.supabase.co'

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host '  psql not found. Using Node + pg instead.' -ForegroundColor Yellow
    npm init -y | Out-Null
    npm install pg --no-save | Out-Null
    $schema = Get-Content supabase/schema.sql -Raw
    $schema2 = Get-Content supabase/schema-v2.sql -Raw
    $sqlFile = New-TemporaryFile
    ($schema + "`n`n" + $schema2) | Out-File -Encoding utf8 $sqlFile.FullName
    @"
const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({ connectionString: '$DATABASE_URL' });
  await c.connect();
  const sql = fs.readFileSync(process.argv[2], 'utf8');
  await c.query(sql);
  await c.end();
  console.log('schema applied');
})().catch(e => { console.error(e.message); process.exit(1); });
"@ | Out-File -Encoding utf8 -FilePath run-sql.cjs
    node run-sql.cjs $sqlFile.FullName
    Remove-Item run-sql.cjs, package.json, package-lock.json -ErrorAction SilentlyContinue
    Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $sqlFile.FullName -ErrorAction SilentlyContinue
} else {
    psql -h $pgHost -U postgres -d postgres -f supabase/schema.sql
    psql -h $pgHost -U postgres -d postgres -f supabase/schema-v2.sql
}
Write-Host '  schemas applied' -ForegroundColor Green

# ---------------------------------------------------------
# Step 3 - Create Supabase storage bucket (idempotent)
# ---------------------------------------------------------
Write-Host ''
Write-Host 'Step 3 - Creating storage bucket...' -ForegroundColor Yellow
$bucketPayload = '{"id":"triage-playbook","name":"triage-playbook","public":false}'
$headers = @{ 'apikey' = $SUPABASE_SERVICE; 'authorization' = "Bearer $SUPABASE_SERVICE"; 'content-type' = 'application/json' }
try {
    Invoke-RestMethod -Uri "$SUPABASE_URL/storage/v1/bucket" -Method Post -Headers $headers -Body $bucketPayload | Out-Null
    Write-Host '  bucket created' -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409 -or $_.ErrorDetails.Message -like '*already exists*') {
        Write-Host '  bucket already exists, ok' -ForegroundColor Green
    } else {
        Write-Host "  bucket creation warning: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------
# Step 4 - git init + initial commit
# ---------------------------------------------------------
Write-Host ''
Write-Host 'Step 4 - Git init + commit...' -ForegroundColor Yellow
if (-not (Test-Path .git)) {
    git init -b main | Out-Null
}
git add .
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m "Initial commit of Triage Playbook by TriageOS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" | Out-Null
    Write-Host '  committed' -ForegroundColor Green
} else {
    Write-Host '  nothing to commit' -ForegroundColor Green
}

# ---------------------------------------------------------
# Step 5 - GitHub repo (create if not linked)
# ---------------------------------------------------------
Write-Host ''
Write-Host 'Step 5 - GitHub repo...' -ForegroundColor Yellow
$remoteExists = git remote | Select-String -Pattern '^origin$' -Quiet
if (-not $remoteExists) {
    gh repo create triage-playbook --public --source=. --remote=origin --push --description "TriageOS - World-class operational triage and stability playbook"
} else {
    git push -u origin main
}
$repoUrl = (gh repo view --json url -q .url).Trim()
Write-Host "  repo: $repoUrl" -ForegroundColor Green

# ---------------------------------------------------------
# Step 6 - Netlify site + env vars + deploy
# ---------------------------------------------------------
Write-Host ''
Write-Host 'Step 6 - Netlify init + deploy...' -ForegroundColor Yellow

# Ensure logged in
$nfStatus = netlify status 2>&1
if ($nfStatus -match 'Not logged in') {
    Write-Host '  Opening browser for Netlify login...' -ForegroundColor Yellow
    netlify login
}

# Link or create
if (-not (Test-Path .netlify/state.json)) {
    $random = -join ((48..57) + (97..122) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
    $siteName = "triage-playbook-$random"
    netlify sites:create --name $siteName --with-ci | Out-Null
    netlify link --name $siteName | Out-Null
}

# Set env vars (idempotent)
netlify env:set SUPABASE_URL $SUPABASE_URL --context production | Out-Null
netlify env:set SUPABASE_ANON_KEY $SUPABASE_ANON --context production | Out-Null
netlify env:set SUPABASE_SERVICE_ROLE_KEY $SUPABASE_SERVICE --context production | Out-Null
netlify env:set ANTHROPIC_API_KEY $ANTHROPIC --context production | Out-Null
netlify env:set EMAIL_FROM $EMAIL_FROM --context production | Out-Null
Write-Host '  env vars set' -ForegroundColor Green

# Deploy
Write-Host '  deploying...' -ForegroundColor Yellow
netlify deploy --prod --dir=. --message="Initial production deploy" | Tee-Object -Variable deployOutput | Out-Null
$liveUrl = ($deployOutput -join "`n" | Select-String -Pattern 'Website URL:\s*(https?://\S+)').Matches.Groups[1].Value
if (-not $liveUrl) {
    $liveUrl = (netlify status 2>&1 | Select-String -Pattern 'Site URL:\s*(https?://\S+)').Matches.Groups[1].Value
}
Write-Host "  live at: $liveUrl" -ForegroundColor Green

# ---------------------------------------------------------
# Step 7 - Verify
# ---------------------------------------------------------
Write-Host ''
Write-Host 'Step 7 - Verifying live site...' -ForegroundColor Yellow
try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $liveUrl
    if ($res.StatusCode -eq 200 -and $res.Content -like '*Triage Playbook*') {
        Write-Host '  200 OK and content verified' -ForegroundColor Green
    } else {
        Write-Host "  unexpected: $($res.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  curl failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---------------------------------------------------------
# Done
# ---------------------------------------------------------
Write-Host ''
Write-Host '=== DONE ===' -ForegroundColor Cyan
Write-Host ''
Write-Host "GitHub:  $repoUrl"
Write-Host "Live:    $liveUrl"
Write-Host ''
Write-Host 'Next: open the live URL, sign in with chris@cotoole.com magic link, create your first triage.'
Write-Host ''
