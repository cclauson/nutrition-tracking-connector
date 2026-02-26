param zoneName string

resource dnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' = {
  name: zoneName
  location: 'global'
}

output nameServers array = dnsZone.properties.nameServers
