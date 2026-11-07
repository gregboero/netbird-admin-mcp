param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
$secret = Get-Content -LiteralPath $Path -Raw | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    Write-Host ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secret.Dispose()
}
