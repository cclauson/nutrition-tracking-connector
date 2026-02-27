<#
.SYNOPSIS
    Bootstrap or update an External ID tenant and service principal for GitHub Actions.

.DESCRIPTION
    This script can be run by a user (not a service principal) to:
    1. Create a new Microsoft Entra External ID tenant (or use an existing one)
    2. Create a service principal with the required Graph API permissions
    3. Configure social identity providers (Google, Facebook)
    4. Output the credentials needed for GitHub Actions secrets

    The script is idempotent and can be re-run to update permissions or add
    social identity providers to an existing tenant.

.PARAMETER ResourceGroup
    The Azure resource group to create the tenant resource in.

.PARAMETER TenantId
    (Optional) Existing CIAM tenant ID. If provided, skips tenant creation.

.PARAMETER DisplayName
    (Optional) Display name for the tenant. Defaults to "<ResourceGroup> Customers"

.PARAMETER Location
    (Optional) The Azure region for the tenant. Defaults to "United States"

.PARAMETER CountryCode
    (Optional) Two-letter country code. Defaults to "US"

.PARAMETER GoogleClientId
    (Optional) Google OAuth client ID for social sign-in.

.PARAMETER GoogleClientSecret
    (Optional) Google OAuth client secret for social sign-in.

.PARAMETER FacebookAppId
    (Optional) Facebook app ID for social sign-in.

.PARAMETER FacebookAppSecret
    (Optional) Facebook app secret for social sign-in.

.PARAMETER RotateSecret
    (Optional) Force regeneration of the service principal client secret,
    even if the app registration already exists.

.EXAMPLE
    # Create a new tenant
    ./SetupExternalIdTenant.ps1 -ResourceGroup "intakeapp"

.EXAMPLE
    # Add Google sign-in to an existing tenant
    ./SetupExternalIdTenant.ps1 -ResourceGroup "intakeapp" -TenantId "60b4213c-..." `
        -GoogleClientId "123456.apps.googleusercontent.com" -GoogleClientSecret "GOCSPX-..."

.EXAMPLE
    # Rotate the service principal secret
    ./SetupExternalIdTenant.ps1 -ResourceGroup "intakeapp" -TenantId "60b4213c-..." -RotateSecret
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory=$false)]
    [string]$TenantId,

    [Parameter(Mandatory=$false)]
    [string]$DisplayName,

    [Parameter(Mandatory=$false)]
    [string]$Location = "United States",

    [Parameter(Mandatory=$false)]
    [string]$CountryCode = "US",

    [Parameter(Mandatory=$false)]
    [string]$GoogleClientId,

    [Parameter(Mandatory=$false)]
    [string]$GoogleClientSecret,

    [Parameter(Mandatory=$false)]
    [string]$FacebookAppId,

    [Parameter(Mandatory=$false)]
    [string]$FacebookAppSecret,

    [switch]$RotateSecret
)

# Derive domain prefix from resource group (lowercase, alphanumeric only)
$DomainPrefix = ($ResourceGroup -replace '[^a-zA-Z0-9]', '').ToLower()

if (-not $DisplayName) {
    $DisplayName = "$ResourceGroup Customers"
}

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "External ID Tenant Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify user is logged in and get subscription
Write-Host "Step 1: Verifying Azure login..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Please log in to Azure first using 'az login'" -ForegroundColor Red
    exit 1
}
Write-Host "  Logged in as: $($account.user.name)" -ForegroundColor Green

$SubscriptionId = $account.id
Write-Host "  Using subscription: $($account.name) ($SubscriptionId)" -ForegroundColor Green

# ---------------------------------------------------------------
# Step 2: Create or locate the External ID tenant
# ---------------------------------------------------------------
if ($TenantId) {
    Write-Host ""
    Write-Host "Step 2: Using existing tenant: $TenantId" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Step 2: Creating External ID tenant..." -ForegroundColor Yellow

    # Register resource provider if needed
    $providerState = az provider show --namespace Microsoft.AzureActiveDirectory --query "registrationState" -o tsv 2>$null
    if ($providerState -ne "Registered") {
        Write-Host "  Registering Microsoft.AzureActiveDirectory provider..."
        az provider register --namespace Microsoft.AzureActiveDirectory

        $maxWait = 60
        $waited = 0
        while ($waited -lt $maxWait) {
            Start-Sleep -Seconds 5
            $waited += 5
            $providerState = az provider show --namespace Microsoft.AzureActiveDirectory --query "registrationState" -o tsv
            Write-Host "    Registration state: $providerState"
            if ($providerState -eq "Registered") { break }
        }
        if ($providerState -ne "Registered") {
            Write-Error "Failed to register Microsoft.AzureActiveDirectory provider."
            exit 1
        }
    }
    Write-Host "  Provider registered: $providerState" -ForegroundColor Green

    Write-Host "  Display Name: $DisplayName"
    Write-Host "  Domain: $DomainPrefix.onmicrosoft.com"
    Write-Host "  Location: $Location"
    Write-Host "  Resource Group: $ResourceGroup"

    $tenantResourceName = $DomainPrefix.ToLower()

    # Check if tenant already exists
    $existingTenant = $null
    try {
        $ErrorActionPreference = "SilentlyContinue"
        $existingTenantJson = az resource show `
            --resource-group $ResourceGroup `
            --resource-type "Microsoft.AzureActiveDirectory/ciamDirectories" `
            --name $tenantResourceName `
            2>$null
        $ErrorActionPreference = "Stop"

        if ($LASTEXITCODE -eq 0 -and $existingTenantJson) {
            $existingTenant = $existingTenantJson | ConvertFrom-Json
        }
    } catch {
        $ErrorActionPreference = "Stop"
    }

    if ($existingTenant) {
        Write-Host "  Tenant already exists, skipping creation..." -ForegroundColor Cyan
        $TenantId = $existingTenant.properties.tenantId
    } else {
        $body = @{
            location = $Location
            properties = @{
                createTenantProperties = @{
                    displayName = $DisplayName
                    countryCode = $CountryCode
                }
            }
            sku = @{
                name = "Standard"
                tier = "A0"
            }
        } | ConvertTo-Json -Depth 10

        $uri = "https://management.azure.com/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.AzureActiveDirectory/ciamDirectories/$($tenantResourceName)?api-version=2023-05-17-preview"

        Write-Host "  Creating tenant (this may take several minutes)..."
        $tempFile = [System.IO.Path]::GetTempFileName()
        $body | Out-File -FilePath $tempFile -Encoding utf8

        $response = az rest --method PUT --uri $uri --body "@$tempFile" --headers "Content-Type=application/json" 2>&1
        Remove-Item $tempFile -ErrorAction SilentlyContinue

        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to create External ID tenant: $response"
            exit 1
        }

        # Wait for tenant to be provisioned
        Write-Host "  Waiting for tenant provisioning..." -ForegroundColor Cyan
        $maxAttempts = 60
        $attempt = 0

        while ($attempt -lt $maxAttempts) {
            Start-Sleep -Seconds 30
            $attempt++
            Write-Host "    Checking status (attempt $attempt of $maxAttempts)..."

            $status = az resource show `
                --resource-group $ResourceGroup `
                --resource-type "Microsoft.AzureActiveDirectory/ciamDirectories" `
                --name $tenantResourceName `
                2>$null | ConvertFrom-Json

            if ($status -and $status.properties.tenantId) {
                $TenantId = $status.properties.tenantId
                Write-Host "  Tenant provisioned successfully!" -ForegroundColor Green
                break
            }
        }

        if (-not $TenantId) {
            Write-Error "Tenant provisioning timed out. Please check the Azure portal."
            exit 1
        }
    }
}

Write-Host "  Tenant ID: $TenantId" -ForegroundColor Green

# ---------------------------------------------------------------
# Step 3: Log into the External ID tenant
# ---------------------------------------------------------------
Write-Host ""
Write-Host "Step 3: Logging into the External ID tenant..." -ForegroundColor Yellow
Write-Host "  You may be prompted to authenticate again for the new tenant."
Write-Host ""

az login --tenant $TenantId --allow-no-subscriptions
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to log into External ID tenant"
    exit 1
}

# ---------------------------------------------------------------
# Step 4: Create or update the service principal for GitHub Actions
# ---------------------------------------------------------------
Write-Host ""
Write-Host "Step 4: Configuring service principal for GitHub Actions..." -ForegroundColor Yellow

$appName = "GitHub Actions - External ID Deployment"
$isNewApp = $false

$existingApp = az ad app list --display-name $appName --query "[0]" 2>$null | ConvertFrom-Json

if ($existingApp) {
    Write-Host "  App registration already exists: $($existingApp.appId)" -ForegroundColor Cyan
    $appId = $existingApp.appId
    $appObjectId = $existingApp.id
} else {
    $app = az ad app create --display-name $appName | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create app registration"
        exit 1
    }
    $appId = $app.appId
    $appObjectId = $app.id
    $isNewApp = $true
    Write-Host "  Created app registration: $appId" -ForegroundColor Green
}

# Create service principal if it doesn't exist
$existingSp = $null
try {
    $ErrorActionPreference = "SilentlyContinue"
    $spJson = az ad sp show --id $appId 2>$null
    $ErrorActionPreference = "Stop"
    if ($LASTEXITCODE -eq 0 -and $spJson) {
        $existingSp = $spJson | ConvertFrom-Json
    }
} catch {
    $ErrorActionPreference = "Stop"
}

if (-not $existingSp) {
    Write-Host "  Creating service principal..."
    az ad sp create --id $appId | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create service principal"
        exit 1
    }
}

# ---------------------------------------------------------------
# Step 5: Configure API permissions
# ---------------------------------------------------------------
Write-Host ""
Write-Host "Step 5: Configuring API permissions..." -ForegroundColor Yellow

$graphAppId = "00000003-0000-0000-c000-000000000000"

$permissions = @{
    "Application.ReadWrite.All"              = "1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9"
    "DelegatedPermissionGrant.ReadWrite.All"  = "8e8e4742-1d95-4f68-9d56-6ee75648c72a"
    "EventListener.ReadWrite.All"             = "0edf5e9e-4ce8-468a-8432-d08631d18c43"
    "IdentityProvider.ReadWrite.All"          = "90db2b9a-d571-4f1c-9c8b-3e5ea5e22643"
}

$ErrorActionPreference = "SilentlyContinue"
foreach ($perm in $permissions.GetEnumerator()) {
    az ad app permission add `
        --id $appId `
        --api $graphAppId `
        --api-permissions "$($perm.Value)=Role" `
        2>$null
    Write-Host "  Configured $($perm.Key)"
}
$ErrorActionPreference = "Stop"

Write-Host "  Granting admin consent..."
$ErrorActionPreference = "SilentlyContinue"
az ad app permission admin-consent --id $appId 2>$null
$consentResult = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($consentResult -ne 0) {
    Write-Host "  WARNING: Could not grant admin consent automatically." -ForegroundColor Yellow
    Write-Host "  You may need to grant consent manually in the Azure portal." -ForegroundColor Yellow
} else {
    Write-Host "  Admin consent granted." -ForegroundColor Green
}

# ---------------------------------------------------------------
# Step 6: Generate client secret (only for new apps or if forced)
# ---------------------------------------------------------------
Write-Host ""
Write-Host "Step 6: Client secret..." -ForegroundColor Yellow

$clientSecret = $null
if ($isNewApp -or $RotateSecret) {
    $secret = az ad app credential reset `
        --id $appId `
        --display-name "GitHub Actions Secret" `
        --years 2 `
        | ConvertFrom-Json

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create client secret"
        exit 1
    }
    $clientSecret = $secret.password
    Write-Host "  New client secret generated." -ForegroundColor Green
} else {
    Write-Host "  Skipping (app already exists, use -RotateSecret to regenerate)." -ForegroundColor Cyan
}

# ---------------------------------------------------------------
# Step 7: Configure social identity providers
# ---------------------------------------------------------------
$socialConfigured = $false

if ($GoogleClientId -and $GoogleClientSecret) {
    Write-Host ""
    Write-Host "Step 7a: Configuring Google identity provider..." -ForegroundColor Yellow

    $accessToken = az account get-access-token --resource-type ms-graph --query accessToken -o tsv

    # Check if Google is already configured
    $existingProviders = Invoke-RestMethod `
        -Uri "https://graph.microsoft.com/v1.0/identity/identityProviders" `
        -Headers @{ Authorization = "Bearer $accessToken" } `
        -Method Get

    $existingGoogle = $existingProviders.value | Where-Object { $_.identityProviderType -eq "Google" }

    if ($existingGoogle) {
        Write-Host "  Updating existing Google identity provider..." -ForegroundColor Cyan
        $body = @{
            clientId = $GoogleClientId
            clientSecret = $GoogleClientSecret
        } | ConvertTo-Json

        Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/identity/identityProviders/$($existingGoogle.id)" `
            -Headers @{ Authorization = "Bearer $accessToken"; "Content-Type" = "application/json" } `
            -Method Patch `
            -Body $body
    } else {
        Write-Host "  Creating Google identity provider..."
        $body = @{
            "@odata.type" = "microsoft.graph.socialIdentityProvider"
            displayName = "Google"
            identityProviderType = "Google"
            clientId = $GoogleClientId
            clientSecret = $GoogleClientSecret
        } | ConvertTo-Json

        Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/identity/identityProviders" `
            -Headers @{ Authorization = "Bearer $accessToken"; "Content-Type" = "application/json" } `
            -Method Post `
            -Body $body
    }

    Write-Host "  Google identity provider configured." -ForegroundColor Green
    $socialConfigured = $true
}

if ($FacebookAppId -and $FacebookAppSecret) {
    Write-Host ""
    Write-Host "Step 7b: Configuring Facebook identity provider..." -ForegroundColor Yellow

    if (-not $accessToken) {
        $accessToken = az account get-access-token --resource-type ms-graph --query accessToken -o tsv
    }

    if (-not $existingProviders) {
        $existingProviders = Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/identity/identityProviders" `
            -Headers @{ Authorization = "Bearer $accessToken" } `
            -Method Get
    }

    $existingFacebook = $existingProviders.value | Where-Object { $_.identityProviderType -eq "Facebook" }

    if ($existingFacebook) {
        Write-Host "  Updating existing Facebook identity provider..." -ForegroundColor Cyan
        $body = @{
            clientId = $FacebookAppId
            clientSecret = $FacebookAppSecret
        } | ConvertTo-Json

        Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/identity/identityProviders/$($existingFacebook.id)" `
            -Headers @{ Authorization = "Bearer $accessToken"; "Content-Type" = "application/json" } `
            -Method Patch `
            -Body $body
    } else {
        Write-Host "  Creating Facebook identity provider..."
        $body = @{
            "@odata.type" = "microsoft.graph.socialIdentityProvider"
            displayName = "Facebook"
            identityProviderType = "Facebook"
            clientId = $FacebookAppId
            clientSecret = $FacebookAppSecret
        } | ConvertTo-Json

        Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/identity/identityProviders" `
            -Headers @{ Authorization = "Bearer $accessToken"; "Content-Type" = "application/json" } `
            -Method Post `
            -Body $body
    }

    Write-Host "  Facebook identity provider configured." -ForegroundColor Green
    $socialConfigured = $true
}

if (-not $socialConfigured -and -not $GoogleClientId -and -not $FacebookAppId) {
    Write-Host ""
    Write-Host "Step 7: Social identity providers..." -ForegroundColor Yellow
    Write-Host "  Skipping (no social provider credentials supplied)." -ForegroundColor Cyan
    Write-Host "  Re-run with -GoogleClientId/-GoogleClientSecret or -FacebookAppId/-FacebookAppSecret to configure." -ForegroundColor Cyan
}

# ---------------------------------------------------------------
# Output
# ---------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "GitHub Secrets to configure:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  EXTERNAL_ID_TENANT_ID:" -ForegroundColor Yellow
Write-Host "    $TenantId"
Write-Host ""
Write-Host "  EXTERNAL_ID_CLIENT_ID:" -ForegroundColor Yellow
Write-Host "    $appId"
Write-Host ""

if ($clientSecret) {
    Write-Host "  EXTERNAL_ID_CLIENT_SECRET:" -ForegroundColor Yellow
    Write-Host "    $clientSecret"
    Write-Host ""
    Write-Host "  IMPORTANT: Save the client secret now! It cannot be retrieved later." -ForegroundColor Red
} else {
    Write-Host "  EXTERNAL_ID_CLIENT_SECRET: (unchanged, use -RotateSecret to regenerate)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "GitHub Variable to configure:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  EXTERNAL_ID_TENANT_SUBDOMAIN:" -ForegroundColor Yellow
Write-Host "    $DomainPrefix"
Write-Host ""

# Switch back to original subscription
Write-Host "Switching back to original subscription..."
az account set --subscription $SubscriptionId 2>$null

Write-Host "Done!" -ForegroundColor Green
