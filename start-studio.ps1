# SpideyContent AI - Zero-Dependency Local HTTP Studio & Shopee Shortlink Scraper Server
$port = 8080
$root = $PSScriptRoot
$url = "http://localhost:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()

Write-Host "==========================================================" -ForegroundColor Red
Write-Host " [SpideyContent AI] Studio & Scraper LIVE at $url" -ForegroundColor Green
Write-Host " [Google Flow Connector] $root\google-flow-connector" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Red

function Get-MetaContent([string]$html, [string]$propName) {
    $r1 = [regex]::Match($html, "<meta[^>]+(?:property|name)=[`"']$propName[`"'][^>]+content=[`"']([\s\S]*?)[`"'][^>]*>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($r1.Success) { return [System.Net.WebUtility]::HtmlDecode($r1.Groups[1].Value).Trim() }
    $r2 = [regex]::Match($html, "<meta[^>]+content=[`"']([\s\S]*?)[`"'][^>]+(?:property|name)=[`"']$propName[`"'][^>]*>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($r2.Success) { return [System.Net.WebUtility]::HtmlDecode($r2.Groups[1].Value).Trim() }
    return ""
}

function Test-Boilerplate([string]$line) {
    if ($line -match "^[-=_*]{3,}$") { return $true }
    if ($line -match "^(?i)(features|specifications|product parameters|product packaging|description|note)\s*:?$") { return $true }
    if ($line -match "(?i)(welcome to|fast shipping|dropshipper|reseller|satisfaction guaranteed|follow our store|manual measurement|actual color|provide a solution)") { return $true }
    return $false
}

function Invoke-ShopeeScrape([string]$targetUrl) {
    try {
        $tmpFile = Join-Path $env:TEMP "spidey_scrape_tmp.html"
        & curl.exe -s -L --max-time 8 -A "WhatsApp/2.24.1.0" $targetUrl -o $tmpFile
        $html = ""
        if (Test-Path $tmpFile) {
            $html = [System.IO.File]::ReadAllText($tmpFile, [System.Text.Encoding]::UTF8)
        }

        $ogTitle = Get-MetaContent $html "og:title"
        if (-not $ogTitle) { $ogTitle = Get-MetaContent $html "twitter:title" }
        $ogDesc = Get-MetaContent $html "og:description"
        if (-not $ogDesc) { $ogDesc = Get-MetaContent $html "description" }
        $ogImage = Get-MetaContent $html "og:image"

        $title = $ogTitle
        $buyMatch = [regex]::Match($ogDesc, "\s-\sBuy\s+([^\r\n]+)$", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($buyMatch.Success) {
            $title = $buyMatch.Groups[1].Value.Trim()
        }
        $title = ($title -replace "CablesLED", "Cables & LED" -replace "\s*\|\s*Shopee.*$", "").Trim()

        $cleanDesc = ($ogDesc -replace "\s-\sBuy\s+[^\r\n]+$", "").Trim()
        $lines = @()
        foreach ($line in ($cleanDesc -split "\r?\n")) {
            $cleaned = ($line -replace "^[^\w\d\[]+\s*", "").Trim()
            if ($cleaned.Length -gt 4 -and -not (Test-Boilerplate $cleaned)) {
                $lines += $cleaned
            }
        }
        $benefitSummary = ($lines | Select-Object -First 4) -join " | "

        $imageDataUrl = ""
        if ($ogImage) {
            $imgTmp = Join-Path $env:TEMP "spidey_scrape_img.jpg"
            & curl.exe -s -L --max-time 6 -A "WhatsApp/2.24.1.0" $ogImage -o $imgTmp
            if (Test-Path $imgTmp) {
                $imgBytes = [System.IO.File]::ReadAllBytes($imgTmp)
                if ($imgBytes.Length -gt 100) {
                    $b64 = [Convert]::ToBase64String($imgBytes)
                    $imageDataUrl = "data:image/jpeg;base64,$b64"
                }
            }
        }

        return @{
            ok = [bool]($title -or $benefitSummary)
            url = $targetUrl
            title = $title
            description = $cleanDesc
            benefitSummary = $benefitSummary
            bullets = ($lines | Select-Object -First 6)
            image = $ogImage
            imageDataUrl = $imageDataUrl
        }
    } catch {
        return @{ ok = $false; error = $_.Exception.Message }
    }
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")
        $response.AddHeader("Access-Control-Allow-Private-Network", "true")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $localPath = $request.Url.LocalPath.TrimStart('/')

        if ($localPath -eq "api/scrape") {
            $targetUrl = $request.QueryString["url"]
            $result = Invoke-ShopeeScrape $targetUrl
            $json = $result | ConvertTo-Json -Depth 5 -Compress
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json; charset=utf-8"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
        }

        if ([string]::IsNullOrWhiteSpace($localPath)) {
            $localPath = "index.html"
        }

        $filePath = Join-Path $root $localPath
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            if ($filePath.EndsWith(".html")) { $response.ContentType = "text/html; charset=utf-8" }
            elseif ($filePath.EndsWith(".js")) { $response.ContentType = "application/javascript; charset=utf-8" }
            elseif ($filePath.EndsWith(".json")) { $response.ContentType = "application/json; charset=utf-8" }
            elseif ($filePath.EndsWith(".css")) { $response.ContentType = "text/css; charset=utf-8" }
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
