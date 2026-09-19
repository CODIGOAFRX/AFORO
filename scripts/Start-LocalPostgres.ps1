param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\17\bin')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localDir = Join-Path $projectRoot '.local'
$dataDir = Join-Path $localDir 'postgres'
if (!(Test-Path (Join-Path $PostgresBin 'initdb.exe'))) { throw "No se encuentra PostgreSQL en $PostgresBin" }
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
if (!(Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
    $passwordFile = Join-Path $localDir 'init-password.txt'
    Set-Content -LiteralPath $passwordFile -Value 'aforo_local' -Encoding ascii
    try {
        & "$PostgresBin\initdb.exe" -D $dataDir -U aforo --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=$passwordFile
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar PostgreSQL.' }
    } finally { Remove-Item -LiteralPath $passwordFile -ErrorAction SilentlyContinue }
}
& "$PostgresBin\pg_ctl.exe" -D $dataDir status
if ($LASTEXITCODE -ne 0) {
    & "$PostgresBin\pg_ctl.exe" -D $dataDir -l (Join-Path $localDir 'postgres.log') -o '-h 127.0.0.1 -p 54329' -w start
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo arrancar PostgreSQL; comprueba el puerto 54329.' }
}
$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = 'aforo_local'
try {
    foreach ($databaseName in @('aforo', 'aforo_test')) {
        $exists = & "$PostgresBin\psql.exe" -h 127.0.0.1 -p 54329 -U aforo -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$databaseName'"
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar la base de datos.' }
        if ($exists -ne '1') {
            & "$PostgresBin\createdb.exe" -h 127.0.0.1 -p 54329 -U aforo $databaseName
            if ($LASTEXITCODE -ne 0) { throw "No se pudo crear $databaseName" }
        }
    }
} finally { $env:PGPASSWORD = $previousPassword }
Write-Host 'PostgreSQL de AFORO disponible en 127.0.0.1:54329. Datos en .local/postgres.'
