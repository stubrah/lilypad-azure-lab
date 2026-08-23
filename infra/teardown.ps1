param(
  [string]$ResourceGroup = "rg-lilypad-lab"
)

$ErrorActionPreference = "Stop"

Write-Host "Resources that will be deleted:"
az resource list --resource-group $ResourceGroup --output table

$confirmation = Read-Host "Type DELETE to remove resource group '$ResourceGroup'"
if ($confirmation -ne "DELETE") {
  Write-Host "Teardown cancelled."
  exit 0
}

az group delete --name $ResourceGroup --yes --no-wait
Write-Host "Deletion requested. Verify with: az group exists --name $ResourceGroup"
