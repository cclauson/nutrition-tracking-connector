@description('The name of the Front Door endpoint to create. This must be globally unique.')
param endpointName string

@description('The custom domain name for the app (e.g. app.intake.cloud).')
param appCustomDomainName string

@description('The custom domain name for the auth proxy (e.g. auth.intake.cloud).')
param authCustomDomainName string

@description('The FQDN of the API container app origin.')
param apiOriginHostName string

@description('The FQDN of the UX container app origin.')
param uxOriginHostName string

@description('The FQDN of the auth proxy container app origin.')
param authOriginHostName string

var frontDoorSkuName = 'Standard_AzureFrontDoor'

module frontDoor 'modules/front-door.bicep' = {
  name: 'front-door'
  params: {
    skuName: frontDoorSkuName
    endpointName: endpointName
    apiOriginHostName: apiOriginHostName
    uxOriginHostName: uxOriginHostName
    authOriginHostName: authOriginHostName
    appCustomDomainName: appCustomDomainName
    authCustomDomainName: authCustomDomainName
  }
}

output frontDoorEndpointHostName string = frontDoor.outputs.frontDoorEndpointHostName
