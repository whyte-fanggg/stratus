param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$OutputPath = ""
)

# Refreshes the saved, exact S3 backup scopes through Stratus.
# AWS credentials remain in the configured AWS CLI profiles; this script never downloads objects.
$result = Invoke-RestMethod -Uri "$BaseUrl/api/aws/inventory?refresh=1" -Method Get
if ($OutputPath) {
  $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $OutputPath -Encoding utf8
  Write-Output "Saved normalized S3 backup inventory to $OutputPath"
} else {
  $result.profiles | ForEach-Object {
    $count = ($_.s3Backups | Where-Object { $_.metric.monthCount -gt 0 } | Measure-Object).Count
    Write-Output "$($_.client): $count populated backup streams"
  }
}
