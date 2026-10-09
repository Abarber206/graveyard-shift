# Builds the shareable copies of Graveyard Shift from index.html + css/ + js/:
#   share\GraveyardShift.html      the whole game in one file: double-click to play, or send it to friends
#   share\web\index.html           the same file, ready to drop onto any static web host (Netlify Drop, GitHub Pages)
#   share\GraveyardShift-web.zip   the same again, zipped for itch.io ("HTML" project, "played in the browser")
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding $false
function Read-Src($rel) { [IO.File]::ReadAllText((Join-Path $root $rel), $utf8) }

$html = Read-Src 'index.html'
$css = Read-Src 'css\style.css'

# script order comes from the loader in index.html, so there is only one list to maintain
$list = [regex]::Match($html, 'const files = \[([^\]]+)\]')
if (-not $list.Success) { throw 'Could not find the script list in index.html' }
$files = [regex]::Matches($list.Groups[1].Value, "'([a-z]+)'") | ForEach-Object { $_.Groups[1].Value }

$sb = New-Object System.Text.StringBuilder
foreach ($f in $files) {
  $js = Read-Src "js\$f.js"
  if ($js -match '</script') { throw "js\$f.js contains '</script' and cannot be embedded" }
  [void]$sb.Append("<script type=`"text/x-gs`" data-file=`"$f`">`n").Append($js).Append("`n</script>`n")
}

$link = '<link rel="stylesheet" href="css/style.css">'
if (-not $html.Contains($link)) { throw 'Could not find the stylesheet link in index.html' }
$html = $html.Replace($link, "<style>`n$css`n</style>")
$at = $html.LastIndexOf('<script type="module">')
if ($at -lt 0) { throw 'Could not find the loader script in index.html' }
$html = $html.Substring(0, $at) + $sb.ToString() + $html.Substring($at)

$out = Join-Path $root 'share'
$web = Join-Path $out 'web'
New-Item -ItemType Directory -Force $web | Out-Null
[IO.File]::WriteAllText((Join-Path $out 'GraveyardShift.html'), $html, $utf8)
[IO.File]::WriteAllText((Join-Path $web 'index.html'), $html, $utf8)
$zip = Join-Path $out 'GraveyardShift-web.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $web 'index.html') -DestinationPath $zip

$kb = [math]::Round((Get-Item (Join-Path $out 'GraveyardShift.html')).Length / 1KB)
Write-Host "Built share\GraveyardShift.html ($kb KB), share\web\index.html and share\GraveyardShift-web.zip"
