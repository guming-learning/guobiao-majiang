metadata description = '国标麻将 Web 应用 —— Azure App Service (Linux, Node 20, 启用 WebSocket)'

@description('应用基础名称')
param appName string = 'guobiao-majiang'

@description('部署区域，默认与资源组相同')
param location string = resourceGroup().location

@description('App Service 计划 SKU。B1 起支持 WebSocket 与常驻(Always On)；F1 为免费层(Socket.IO 回退长轮询)')
@allowed([
  'F1'
  'B1'
  'B2'
  'S1'
  'P0v3'
])
param sku string = 'B1'

var planName = 'plan-${appName}'
var siteName = '${appName}-${uniqueString(resourceGroup().id)}'
var isFree = sku == 'F1'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: {
    name: sku
  }
  properties: {
    reserved: true // Linux
  }
}

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: siteName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: true // Socket.IO 粘性会话（单实例内存房间状态）
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      webSocketsEnabled: true
      alwaysOn: !isFree
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'FtpsOnly'
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true' // 部署时由 Oryx 执行 npm install
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
      ]
    }
  }
}

output webAppName string = site.name
output webAppUrl string = 'https://${site.properties.defaultHostName}'
output resourceGroupName string = resourceGroup().name
