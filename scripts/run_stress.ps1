$port = 3013
Write-Host "Iniciando servidor en puerto $port (Job)..."
$wd = Get-Location
$job = Start-Job -ScriptBlock { 
    param($port, $wd)
    $env:PORT = $port
    Set-Location $wd
    # Usamos npx ts-node pero redirigimos output nosotros mismos si queremos verlo con Receive-Job
    npx ts-node src/index.ts 
} -ArgumentList $port, $wd

# Esperar al puerto
$maxRetries = 30
$connected = $false
for ($i = 0; $i -lt $maxRetries; $i++) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $port)
        $tcp.Close()
        $connected = $true
        Write-Host "✅ Servidor ONLINE en puerto $port"
        break
    }
    catch {
        Write-Host "⏳ Esperando servidor... ($i/$maxRetries)"
        
        # Chequear si el job falló o terminó
        if ($job.State -ne 'Running') {
            Write-Host "❌ El servidor se detuvo."
            Receive-Job $job
            break
        }
        Start-Sleep -Seconds 2
    }
}

if ($connected) {
    Write-Host "🚀 Ejecutando Stress Test..."
    $env:BASE_URL = "http://127.0.0.1:$port"
    try {
        npx ts-node scripts/stress_test.ts
    }
    catch {
        Write-Host "❌ Error en script de test:"
        Write-Host $_
    }
}
else {
    Write-Host "❌ Timeout esperando al servidor."
}

Write-Host "--- LOGS DEL SERVIDOR (RAW) ---"
Receive-Job $job
Write-Host "-------------------------------"

Stop-Job $job
Remove-Job $job
Write-Host "🏁 Finalizado."
