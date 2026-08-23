# Lily Pad Lab 1: Resident Intake with Azure Functions and Azure SQL

## Outcome

You will deploy a JavaScript HTTP API, give it a managed identity, grant that
identity only `INSERT` permission on one Azure SQL table, submit fake data, inspect
logs, and delete the lab resource group.

This is an AZ-104-style administration lab. JavaScript is only the workload.

> **Fake data only.** The API accepts only `@example.com` addresses. Never enter
> real resident, health, financial, recovery, or identifying information.

## Architecture

Browser form → HTTP-triggered Azure Function → Azure SQL Database

The Function authenticates to SQL through Microsoft Entra ID using its
system-assigned managed identity. There is no SQL password in the code.

## Prerequisites

- PowerShell 7
- Azure CLI (`az version`)
- Node.js 22 or later (`node --version`)
- Azure Functions Core Tools 4 (`func --version`)
- `sqlcmd` with Microsoft Entra authentication support (`sqlcmd -?`)
- An Azure subscription where you can create resource groups, Functions, and SQL

## 1. Set variables and confirm the subscription

Run these from PowerShell. Names containing the suffix must be globally unique.

```powershell
az login
az account show --output table

$Location = "centralus"
$ResourceGroup = "rg-lilypad-lab"
$Suffix = (Get-Random -Minimum 10000 -Maximum 99999)
$StorageAccount = "lilypadlab$Suffix"
$FunctionApp = "func-lilypad-lab-$Suffix"
$SqlServer = "sql-lilypad-lab-$Suffix"
$Database = "lilypadlabdb"

az group create --name $ResourceGroup --location $Location --tags purpose=AZ-104-lab owner=stuart --output table
```

Verify:

```powershell
az group show --name $ResourceGroup --query "{name:name,location:location,provisioningState:properties.provisioningState}" --output table
```

## 2. Create Azure SQL Database

The lab uses serverless compute with automatic pause after one hour. You will still
delete the resource group at the end.

```powershell
$SignedInUser = az ad signed-in-user show --query userPrincipalName --output tsv
$SignedInUserId = az ad signed-in-user show --query id --output tsv

az sql server create `
  --resource-group $ResourceGroup `
  --name $SqlServer `
  --location $Location `
  --enable-ad-only-auth `
  --external-admin-principal-type User `
  --external-admin-name $SignedInUser `
  --external-admin-sid $SignedInUserId

az sql db create `
  --resource-group $ResourceGroup `
  --server $SqlServer `
  --name $Database `
  --edition GeneralPurpose `
  --family Gen5 `
  --capacity 1 `
  --compute-model Serverless `
  --auto-pause-delay 60
```

Allow your current public IP temporarily so `sqlcmd` can initialize and verify the
database:

```powershell
$MyIp = (Invoke-RestMethod -Uri "https://api.ipify.org")
az sql server firewall-rule create --resource-group $ResourceGroup --server $SqlServer --name AllowMyLabComputer --start-ip-address $MyIp --end-ip-address $MyIp
```

Verify:

```powershell
az sql db show --resource-group $ResourceGroup --server $SqlServer --name $Database --query "{status:status,tier:currentServiceObjectiveName,autoPause:autoPauseDelay}" --output table
```

## 3. Create the Function App and managed identity

```powershell
az storage account create --resource-group $ResourceGroup --name $StorageAccount --location $Location --sku Standard_LRS --allow-blob-public-access false

az functionapp create `
  --resource-group $ResourceGroup `
  --name $FunctionApp `
  --storage-account $StorageAccount `
  --flexconsumption-location $Location `
  --runtime node `
  --runtime-version 22

az functionapp identity assign --resource-group $ResourceGroup --name $FunctionApp

az functionapp config appsettings set `
  --resource-group $ResourceGroup `
  --name $FunctionApp `
  --settings SQL_SERVER="$SqlServer.database.windows.net" SQL_DATABASE=$Database LAB_MODE=true FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR=true
```

Verify the identity and settings without printing all configuration values:

```powershell
az functionapp identity show --resource-group $ResourceGroup --name $FunctionApp --query "{principalId:principalId,tenantId:tenantId}" --output table
az functionapp config appsettings list --resource-group $ResourceGroup --name $FunctionApp --query "[?name=='SQL_SERVER' || name=='SQL_DATABASE' || name=='LAB_MODE'].name" --output table
```

## 4. Create the table and least-privilege database user

From the repository root:

```powershell
sqlcmd -S "$SqlServer.database.windows.net" -d $Database -G -l 30 -i database/schema.sql -v FunctionAppName=$FunctionApp
```

Verify the table, managed-identity database user, and permission:

```powershell
sqlcmd -S "$SqlServer.database.windows.net" -d $Database -G -Q "SELECT name FROM sys.tables WHERE name='ResidentApplications'; SELECT name, type_desc FROM sys.database_principals WHERE name='$FunctionApp'; SELECT permission_name FROM sys.database_permissions WHERE grantee_principal_id=DATABASE_PRINCIPAL_ID('$FunctionApp');"
```

Expected: the table, an `EXTERNAL_USER`, and `INSERT` permission.

## 5. Deploy the API

```powershell
Push-Location api
npm install
npm run check
func azure functionapp publish $FunctionApp --javascript
Pop-Location
```

Verify Function registration:

```powershell
az functionapp function list --resource-group $ResourceGroup --name $FunctionApp --query "[].{name:name,invokeUrl:invokeUrlTemplate}" --output table
$ApiHost = az functionapp show --resource-group $ResourceGroup --name $FunctionApp --query defaultHostName --output tsv
Invoke-RestMethod -Uri "https://$ApiHost/api/health"
```

Expected: `status: healthy` and `database: reachable`.

## 6. Connect and test the browser form

For this first lab, the static site runs locally and calls the deployed Function.
Permit only the local development origin:

```powershell
az functionapp cors add --resource-group $ResourceGroup --name $FunctionApp --allowed-origins "http://localhost:8000"
```

Open `js/config.js` and set:

```javascript
window.LILYPAD_API_BASE_URL = "https://YOUR-FUNCTION-NAME.azurewebsites.net";
```

Replace `YOUR-FUNCTION-NAME` with the value in `$ApiHost`, then start a simple
local web server from the repository root:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/contact.html`, submit the prefilled-style fake values,
and confirm that the page displays a saved application ID.

## 7. Submit one fake application through PowerShell

```powershell
$FakeApplication = @{
  fullName = "Test Resident"
  email = "resident@example.com"
  phone = "214-555-0100"
  situation = "Fake data for AZ-104 Lab 1"
  timeline = "30days"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://$ApiHost/api/resident-applications" `
  -ContentType "application/json" `
  -Body $FakeApplication
```

Expected: HTTP 201 with an `applicationId` and `status: saved`.

Verify directly in SQL:

```powershell
sqlcmd -S "$SqlServer.database.windows.net" -d $Database -G -Q "SELECT ApplicationId, FullName, Email, Timeline, SubmittedAt FROM dbo.ResidentApplications ORDER BY SubmittedAt DESC;"
```

## 8. Observe and explain

```powershell
az monitor app-insights component show --resource-group $ResourceGroup --app $FunctionApp --output table
az functionapp log tail --resource-group $ResourceGroup --name $FunctionApp
```

Questions to answer before teardown:

1. Why is the browser not allowed to connect directly to Azure SQL?
2. What credential does `DefaultAzureCredential` use inside the Function App?
3. Why does the Function identity receive `INSERT`, but not `db_owner`?
4. Which resources remain billable if you merely close PowerShell?

## 9. Teardown — do this the same day

First inventory the exact target:

```powershell
az resource list --resource-group $ResourceGroup --output table
```

Then use the guarded teardown script:

```powershell
./infra/teardown.ps1 -ResourceGroup $ResourceGroup
```

Because deletion is asynchronous, verify until the command returns `false`:

```powershell
az group exists --name $ResourceGroup
```

Do not treat stopping the Function App as complete teardown. The storage account,
SQL logical server, database, and monitoring resources can remain.

## Production gaps intentionally left for later labs

- Authentication and authorization
- Rate limiting, bot protection, and abuse controls
- Private networking and public-access restrictions
- Admin-only application review
- Data classification, retention, consent, and encryption requirements
- Stripe test-mode checkout with Apple Pay and Google Pay

This project is a training workload, not a production resident-management system.
