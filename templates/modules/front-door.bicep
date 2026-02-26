@description('The name of the Front Door endpoint to create. This must be globally unique.')
param endpointName string

@description('The host name of the API container app origin.')
param apiOriginHostName string

@description('The host name of the UX container app origin.')
param uxOriginHostName string

@description('The host name of the auth proxy container app origin.')
param authOriginHostName string

@description('The custom domain name for the app (e.g. app.intake.cloud).')
param appCustomDomainName string

@description('The custom domain name for the auth proxy (e.g. auth.intake.cloud).')
param authCustomDomainName string

@description('The name of the SKU to use when creating the Front Door profile.')
@allowed([
  'Standard_AzureFrontDoor'
  'Premium_AzureFrontDoor'
])
param skuName string

@allowed([
  'Detection'
  'Prevention'
])
@description('The mode that the WAF should be deployed using.')
param wafMode string = 'Prevention'

var profileName = 'MyFrontDoor'
var wafPolicyName = 'WafPolicy'
var securityPolicyName = 'SecurityPolicy'

// Create valid resource names for custom domains (no periods allowed)
var appCustomDomainResourceName = replace(appCustomDomainName, '.', '-')
var authCustomDomainResourceName = replace(authCustomDomainName, '.', '-')

resource profile 'Microsoft.Cdn/profiles@2021-06-01' = {
  name: profileName
  location: 'global'
  sku: {
    name: skuName
  }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2021-06-01' = {
  name: endpointName
  parent: profile
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

// --- Custom Domains ---

resource appCustomDomain 'Microsoft.Cdn/profiles/customDomains@2021-06-01' = {
  name: appCustomDomainResourceName
  parent: profile
  properties: {
    hostName: appCustomDomainName
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
  }
}

resource authCustomDomain 'Microsoft.Cdn/profiles/customDomains@2021-06-01' = {
  name: authCustomDomainResourceName
  parent: profile
  properties: {
    hostName: authCustomDomainName
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
  }
}

// --- Origin Groups ---

resource apiOriginGroup 'Microsoft.Cdn/profiles/originGroups@2021-06-01' = {
  name: 'ApiOriginGroup'
  parent: profile
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/health'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

resource uxOriginGroup 'Microsoft.Cdn/profiles/originGroups@2021-06-01' = {
  name: 'UxOriginGroup'
  parent: profile
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/health'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

resource authOriginGroup 'Microsoft.Cdn/profiles/originGroups@2021-06-01' = {
  name: 'AuthOriginGroup'
  parent: profile
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/health'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

// --- Origins ---

resource apiOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2021-06-01' = {
  name: 'ApiOrigin'
  parent: apiOriginGroup
  properties: {
    hostName: apiOriginHostName
    httpPort: 80
    httpsPort: 443
    originHostHeader: apiOriginHostName
    priority: 1
    weight: 1000
  }
}

resource uxOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2021-06-01' = {
  name: 'UxOrigin'
  parent: uxOriginGroup
  properties: {
    hostName: uxOriginHostName
    httpPort: 80
    httpsPort: 443
    originHostHeader: uxOriginHostName
    priority: 1
    weight: 1000
  }
}

resource authOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2021-06-01' = {
  name: 'AuthOrigin'
  parent: authOriginGroup
  properties: {
    hostName: authOriginHostName
    httpPort: 80
    httpsPort: 443
    originHostHeader: authOriginHostName
    priority: 1
    weight: 1000
  }
}

// --- Routes ---

resource apiRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2021-06-01' = {
  name: 'ApiRoute'
  parent: endpoint
  dependsOn: [
    apiOrigin
  ]
  properties: {
    customDomains: [
      {
        id: appCustomDomain.id
      }
    ]
    originGroup: {
      id: apiOriginGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/api/*'
      '/.well-known/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
  }
}

resource uxRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2021-06-01' = {
  name: 'UxRoute'
  parent: endpoint
  dependsOn: [
    uxOrigin
    apiRoute // Ensure more-specific api routes are created first
  ]
  properties: {
    customDomains: [
      {
        id: appCustomDomain.id
      }
    ]
    originGroup: {
      id: uxOriginGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
  }
}

resource authRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2021-06-01' = {
  name: 'AuthRoute'
  parent: endpoint
  dependsOn: [
    authOrigin
  ]
  properties: {
    customDomains: [
      {
        id: authCustomDomain.id
      }
    ]
    originGroup: {
      id: authOriginGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Disabled'
    httpsRedirect: 'Enabled'
  }
}

// --- WAF ---

resource wafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2022-05-01' = {
  name: wafPolicyName
  location: 'global'
  sku: {
    name: skuName
  }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: wafMode
    }
  }
}

resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2021-06-01' = {
  parent: profile
  name: securityPolicyName
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: wafPolicy.id
      }
      associations: [
        {
          domains: [
            {
              id: endpoint.id
            }
          ]
          patternsToMatch: [
            '/*'
          ]
        }
      ]
    }
  }
}

output frontDoorEndpointHostName string = endpoint.properties.hostName
output frontDoorId string = profile.properties.frontDoorId
