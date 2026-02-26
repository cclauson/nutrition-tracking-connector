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
    ]
    envVars: [
      { name: 'PORT', value: '3000' }
      { name: 'ENTRA_TENANT_ID', value: proxyEntraTenantId }
      { name: 'ENTRA_CLIENT_ID', value: proxyEntraClientId }
      { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
      { name: 'PROXY_BASE_URL', value: proxyBaseUrl }
      { name: 'ENTRA_AUTHORITY', value: proxyEntraAuthority }
    ]
  }
}

// API Container App (ACR image)
module apiContainerApp 'modules/container-app.bicep' = {
  name: 'apiContainerAppDeployment'
  params: {
    containerAppName: 'vnext-api'
    containerAppEnvId: containerAppEnv.id
    image: apiImage
    registryServer: acr.outputs.acrLoginServer
    registryIdentity: 'system'
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
  dependsOn: [
    acr
  ]
}

// UX Container App (ACR image)
module uxContainerApp 'modules/container-app.bicep' = {
  name: 'uxContainerAppDeployment'
  params: {
    containerAppName: 'vnext-ux'
    containerAppEnvId: containerAppEnv.id
    image: uxImage
    registryServer: acr.outputs.acrLoginServer
    registryIdentity: 'system'
    maxReplicas: 3
    envVars: [
      { name: 'PORT', value: '3000' }
      { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: uxAppInsightsConnectionString }
    ]
  }
  dependsOn: [
    acr
  ]
}

// ACR Pull role assignments for API and UX container apps
resource acrResource 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource apiAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrResource.id, apiContainerApp.outputs.name, 'acrpull')
  scope: acrResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: apiContainerApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    acr
  ]
}

resource uxAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrResource.id, uxContainerApp.outputs.name, 'acrpull')
  scope: acrResource
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: uxContainerApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    acr
  ]
}

output acrLoginServer string = acr.outputs.acrLoginServer
output dnsNameServers array = dnsZone.outputs.nameServers
output authProxyContainerAppFqdn string = authProxyContainerApp.outputs.fqdn
output apiContainerAppFqdn string = apiContainerApp.outputs.fqdn
output uxContainerAppFqdn string = uxContainerApp.outputs.fqdn
