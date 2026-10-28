# Renders tools/cv/Apurv-Das-CV-*.html to cv/*.pdf with headless Edge and prints each PDF's page count.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
New-Item -ItemType Directory -Force "$root\cv" | Out-Null
foreach ($r in 'QA', 'Systems', 'Web', 'AI') {
    $html = "$root\tools\cv\Apurv-Das-CV-$r.html"
    $pdf = "$root\cv\Apurv-Das-CV-$r.pdf"
    $tmp = Join-Path $env:TEMP "cv-edge-$r-$([guid]::NewGuid().ToString('N'))"
    Remove-Item $pdf -ErrorAction SilentlyContinue
    & $edge --headless=new --disable-gpu --no-pdf-header-footer "--user-data-dir=$tmp" "--print-to-pdf=$pdf" ("file:///" + ($html -replace '\\', '/')) 2>$null | Out-Null
    for ($i = 0; $i -lt 40 -and -not (Test-Path $pdf); $i++) { Start-Sleep -Milliseconds 250 }
    Start-Sleep -Milliseconds 500
    $b = [Text.Encoding]::GetEncoding(28591).GetString([IO.File]::ReadAllBytes($pdf))
    $pages = ([regex]::Matches($b, '/Type\s*/Page(?!s)')).Count
    "{0}: {1} page(s), {2:N0} KB" -f $r, $pages, ((Get-Item $pdf).Length / 1KB)
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
