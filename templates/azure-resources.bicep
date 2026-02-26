param acrName string
param aksName string
param logAnalyticsWorkspaceName string
param applicationInsightsName string
param postgresServerName string
@secure()
param postgresAdminPassword string
param dnsZoneName string
param containerAppEnvName string
param proxyImage string
param proxyBaseUrl string
param proxyEntraTenantId string
param proxyEntraClientId string
@secure()
param proxyEntraClientSecret string
param proxyEntraAuthority string

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoringDeployment'
  params: {
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    applicationInsightsName: applicationInsightsName
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acrDeployment'
  params: {
    acrName: acrName
  }
}

module aks 'modules/aks.bicep' = {
  name: 'aksDeployment'
  params: {
    aksName: aksName
    acrId: acr.outputs.acrId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
  }
}

module postgresql 'modules/postgresql.bicep' = {
  name: 'postgresqlDeployment'
  params: {
    serverName: postgresServerName
    adminPassword: postgresAdminPassword
  }
}

module dnsZone 'modules/dns-zone.bicep' = {
  name: 'dnsZoneDeployment'
  params: {
    zoneName: dnsZoneName
  }
}

module containerApp 'modules/container-app.bicep' = {
  name: 'containerAppDeployment'
  params: {
    containerAppEnvName: containerAppEnvName
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    proxyImage: proxyImage
    proxyBaseUrl: proxyBaseUrl
    proxyEntraTenantId: proxyEntraTenantId
    proxyEntraClientId: proxyEntraClientId
    proxyEntraClientSecret: proxyEntraClientSecret
    proxyEntraAuthority: proxyEntraAuthority
  }
  dependsOn: [
    monitoring
  ]
}

output acrLoginServer string = acr.outputs.acrLoginServer
output aksName string = aks.outputs.aksName
output dnsNameServers array = dnsZone.outputs.nameServers
output containerAppFqdn string = containerApp.outputs.containerAppFqdn
