param containerAppName string
param containerAppEnvId string
param image string
param envVars array
param secrets array = []
param minReplicas int = 1
param maxReplicas int = 1
param targetPort int = 3000
param registryServer string = ''
param registryIdentity string = ''
param stickySessionsAffinity string = 'none'
param location string = resourceGroup().location

var registries = registryServer != '' ? [
  {
    server: registryServer
    identity: registryIdentity
  }
] : []

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: registryServer != '' ? {
    type: 'SystemAssigned'
  } : null
  properties: {
    managedEnvironmentId: containerAppEnvId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: union(
        {
          external: true
          targetPort: targetPort
        },
        stickySessionsAffinity == 'sticky' ? {
          stickySessions: {
            affinity: 'sticky'
          }
        } : {}
      )
      secrets: secrets
      registries: registries
    }
    template: {
      containers: [
        {
          name: containerAppName
          image: image
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: envVars
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn
output name string = containerApp.name
output principalId string = registryServer != '' ? containerApp.identity.principalId : ''
