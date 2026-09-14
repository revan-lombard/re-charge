# Swaps the site's baked-in URLs to a new custom domain and creates the
# CNAME file GitHub Pages needs. Run from the repo root:
#   .\scripts\set-domain.ps1 -Domain "re-charge.co.za"
# Then review, commit and push.
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9.-]+\.[a-z]{2,}$')]
  [string]$Domain
)

$old = 'https://re-charge.co.za'
$new = "https://$Domain"

$files = @('index.html', 'services.html', 'work.html', 'pricing.html', 'start.html', '404.html', 'store.html', 'scan.html', 'bins.html', 'back-a-bin.html', 'sitemap.xml', 'robots.txt')
foreach ($f in $files) {
  $c = Get-Content $f -Raw
  $c = $c.Replace($old, $new)
  # 404 uses absolute /re-charge/ paths (project-page subpath); a custom
  # domain serves from the root, so collapse them
  if ($f -eq '404.html') { $c = $c.Replace('/re-charge/', '/') }
  Set-Content $f $c -NoNewline -Encoding UTF8
  Write-Host "updated $f"
}

# GitHub Pages custom-domain marker (harmless if hosting moves to Cloudflare Pages)
Set-Content 'CNAME' $Domain -NoNewline -Encoding ascii
Write-Host "created CNAME -> $Domain"

$left = (Select-String -Path $files -Pattern ([regex]::Escape($old)) | Measure-Object).Count
Write-Host "remaining old-domain references: $left (should be 0)"
Write-Host "`nNext: git add -A; git commit; git push - then set the DNS records (see DEPLOY-DOMAIN.md)"
