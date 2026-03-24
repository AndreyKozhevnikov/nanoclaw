# NanoClaw startup script for Windows
# Run this to start the NanoClaw service
Set-Location $PSScriptRoot
$env:NODE_ENV = "production"
Write-Host "Starting NanoClaw..."
node dist/index.js
