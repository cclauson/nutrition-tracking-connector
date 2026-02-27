param acrName string
param logAnalyticsWorkspaceName string
param applicationInsightsName string
param postgresServerName string
@secure()
param postgresAdminPassword string
param dnsZoneName string
param containerAppEnvName string

// Auth proxy params
param proxyImage string
param proxyBaseUrl string
param proxyEntraTenantId string
param proxyEntraClientId string
@secure()
param proxyEntraClientSecret string
param proxyEntraAuthority string

// API container app params
param apiImage string
param apiDatabaseUrl string = ''
param apiEntraTenantId string = ''
param apiEntraClientId string = ''
param apiProxyBaseUrl string = ''
param apiEntraAuthority string = ''
param apiAppInsightsConnectionString string = ''

// UX container app params
param uxImage string
param uxAppInsightsConnectionString string = ''

param location string = resourceGroup().location

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

// Shared Container App Environment
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
  }
  dependsOn: [
    monitoring
  ]
}

// Auth Proxy Container App (GHCR image, no ACR)
var proxyDatabaseUrl = 'postgresql://pgadmin:${postgresAdminPassword}@${postgresql.outputs.fqdn}:5432/proxydb?sslmode=require'

module authProxyContainerApp 'modules/container-app.bicep' = {
  name: 'authProxyContainerAppDeployment'
  params: {
    containerAppName: 'auth-proxy'
    containerAppEnvId: containerAppEnv.id
    image: proxyImage
    secrets: [
      {
        name: 'entra-client-secret'
        value: proxyEntraClientSecret
      }
      {
        name: 'database-url'
        value: proxyDatabaseUrl
      }
    ]
    envVars: [
      { name: 'PORT', value: '3000' }
      { name: 'DATABASE_URL', secretRef: 'database-url' }
      { name: 'ENTRA_TENANT_ID', value: proxyEntraTenantId }
      { name: 'ENTRA_CLIENT_ID', value: proxyEntraClientId }
      { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
      { name: 'PROXY_BASE_URL', value: proxyBaseUrl }
      { name: 'ENTRA_AUTHORITY', value: proxyEntraAuthority }
    ]
  }
}

// API Container App (placeholder image on initial deploy, real ACR image set by app deploy workflow)
module apiContainerApp 'modules/container-app.bicep' = {
  name: 'apiContainerAppDeployment'
  params: {
    containerAppName: 'vnext-api'
    containerAppEnvId: containerAppEnv.id
    image: apiImage
    envVars: [
      { name: 'PORT', value: '3000' }
      { name: 'DATABASE_URL', value: apiDatabaseUrl }
      { name: 'ENTRA_TENANT_ID', value: apiEntraTenantId }
      { name: 'ENTRA_CLIENT_ID', value: apiEntraClientId }
      { name: 'PROXY_BASE_URL', value: apiProxyBaseUrl }
      { name: 'ENTRA_AUTHORITY', value: apiEntraAuthority }
      { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: apiAppInsightsConnectionString }
    ]
  }
}

// UX Container App (placeholder image on initial deploy, real ACR image set by app deploy workflow)
module uxContainerApp 'modules/container-app.bicep' = {
  name: 'uxContainerAppDeployment'
  params: {
    containerAppName: 'vnext-ux'
    containerAppEnvId: containerAppEnv.id
    image: uxImage
    maxReplicas: 3
    envVars: [
      { name: 'PORT', value: '3000' }
      { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: uxAppInsightsConnectionString }
    ]
  }
}

output acrLoginServer string = acr.outputs.acrLoginServer
output dnsNameServers array = dnsZone.outputs.nameServers
output authProxyContainerAppFqdn string = authProxyContainerApp.outputs.fqdn
output apiContainerAppFqdn string = apiContainerApp.outputs.fqdn
output uxContainerAppFqdn string = uxContainerApp.outputs.fqdn
