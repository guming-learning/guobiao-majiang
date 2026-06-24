<#
  一键部署国标麻将到 Azure App Service。
  前置：已用有权限的账号登录到目标订阅所在租户（见 infra/README.md 的设备码登录）。
  用法：
    pwsh infra/deploy.ps1
    pwsh infra/deploy.ps1 -Sku F1            # 免费层
    pwsh infra/deploy.ps1 -Location westus2  # 指定区域
#>
param(
  [string]$Subscription = '174fdafa-d969-48fc-a15d-5abc25bda633',
  [string]$ResourceGroup = 'rg-guobiao-majiang',
  [string]$Location = 'centralus',
  [string]$Sku = 'F1',
  [string]$AppName = 'guobiao-majiang'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> 选择订阅 $Subscription"
az account set --subscription $Subscription

Write-Host "==> 创建资源组 $ResourceGroup ($Location)"
az group create -n $ResourceGroup -l $Location -o none

Write-Host "==> 部署基础设施 (Bicep, SKU=$Sku)"
$out = az deployment group create `
  -g $ResourceGroup `
  -f (Join-Path $PSScriptRoot 'main.bicep') `
  -p appName=$AppName sku=$Sku location=$Location `
  --query properties.outputs -o json | ConvertFrom-Json
$site = $out.webAppName.value
$url = $out.webAppUrl.value
Write-Host "==> Web App: $site"

Write-Host "==> 打包应用(仅运行所需文件)"
$zip = Join-Path $root 'deploy.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Push-Location $root
Compress-Archive -Path 'server.js', 'package.json', 'package-lock.json', 'src', 'public' -DestinationPath $zip -Force
Pop-Location

Write-Host "==> Zip 部署(平台执行 npm install 并启动)"
az webapp deploy -g $ResourceGroup -n $site --src-path $zip --type zip -o none
Remove-Item $zip -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ 部署完成: $url" -ForegroundColor Green
