param containerAppEnvName string
param logAnalyticsWorkspaceName string
param proxyImage string
param proxyBaseUrl string
param proxyEntraTenantId string
param proxyEntraClientId string
@secure()
param proxyEntraClientSecret string
param proxyEntraAuthority string
param location string = resourceGroup().location

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
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'auth-proxy'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
      }
      secrets: [
        {
          name: 'entra-client-secret'
          value: proxyEntraClientSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'auth-proxy'
          image: proxyImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'PORT', value: '3000' }
            { name: 'ENTRA_TENANT_ID', value: proxyEntraTenantId }
            { name: 'ENTRA_CLIENT_ID', value: proxyEntraClientId }
            { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
            { name: 'PROXY_BASE_URL', value: proxyBaseUrl }
            { name: 'ENTRA_AUTHORITY', value: proxyEntraAuthority }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppName string = containerApp.name
