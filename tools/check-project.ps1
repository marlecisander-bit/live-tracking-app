$ErrorActionPreference = 'Stop'

$project = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pages = @((Join-Path $project 'index.html'), (Join-Path $project 'live-map.html'))
$problems = New-Object System.Collections.Generic.List[string]

foreach ($page in $pages) {
    $html = [System.IO.File]::ReadAllText($page)
    $pageName = [System.IO.Path]::GetFileName($page)

    [regex]::Matches($html, '(?:src|href)="((?:js|css)/[^"]+)"') | ForEach-Object {
        $relativePath = $_.Groups[1].Value.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath (Join-Path $project $relativePath))) {
            $problems.Add("$pageName references missing file: $relativePath")
        }
    }

    if ($html -match '<style(?:\s|>)') { $problems.Add("$pageName contains an inline style block") }
    if ($html -match '<script\s*>') { $problems.Add("$pageName contains an inline script block") }
    if ($html -match '\son[a-z]+=') { $problems.Add("$pageName contains an inline event handler") }
    if ($html -match '[\u00C2\u00C3]|\u00E2\u20AC|\u00F0\u0178') {
        $problems.Add("$pageName may contain broken character encoding")
    }
}

Get-ChildItem -LiteralPath $project -File -Recurse | Where-Object {
    $_.Extension -in '.html', '.css', '.js', '.md'
} | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName)
    if ($content -match '[\u00C2\u00C3]|\u00E2\u20AC|\u00F0\u0178') {
        $problems.Add("Possible broken character encoding in $($_.FullName.Substring($project.Length + 1))")
    }
}

Get-ChildItem -LiteralPath (Join-Path $project 'css') -Filter '*.css' -Recurse | ForEach-Object {
    $css = [System.IO.File]::ReadAllText($_.FullName)
    if (([regex]::Matches($css, '\{')).Count -ne ([regex]::Matches($css, '\}')).Count) {
        $problems.Add("Unbalanced CSS braces in $($_.FullName.Substring($project.Length + 1))")
    }
}

Get-ChildItem -LiteralPath (Join-Path $project 'js') -Filter '*.js' -Recurse | ForEach-Object {
    $javascript = [System.IO.File]::ReadAllText($_.FullName)
    if (([regex]::Matches($javascript, '\{')).Count -ne ([regex]::Matches($javascript, '\}')).Count) {
        $problems.Add("Unbalanced JavaScript braces in $($_.FullName.Substring($project.Length + 1))")
    }
}

if ($problems.Count -gt 0) {
    Write-Host 'Project check failed:' -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "- $_" }
    exit 1
}

Write-Host 'Project check passed.' -ForegroundColor Green
Write-Host 'References, HTML structure, text encoding, and CSS braces look correct.'
