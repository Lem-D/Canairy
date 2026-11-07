# Flash an Arduino sketch from Windows using the Docker `firmware` service.
#
# Docker Desktop can't see COM ports, so this hands the board to WSL with usbipd,
# runs `docker compose run firmware`, then gives the board back to Windows.
#
# Usage (from the repo root):
#   .\scripts\flash.ps1                        # flash the receiver
#   .\scripts\flash.ps1 -Sketch transmitter    # flash the transmitter
#
# Requires: Docker Desktop and usbipd-win (winget install usbipd).
# The first run asks for admin once (UAC) to share the board with usbipd.

param(
    [ValidateSet("receiver", "transmitter")]
    [string]$Sketch = "receiver",
    # USB VID:PID of the board. 2341:0043 = Arduino Uno R3. CH340 clones are usually 1a86:7523.
    [string]$HardwareId = "2341:0043",
    # Where the board appears in Linux. Genuine Uno = /dev/ttyACM0, CH340 clones = /dev/ttyUSB0.
    [string]$SerialPort = "/dev/ttyACM0"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Get-BoardState {
    $line = usbipd list | Select-String -SimpleMatch $HardwareId | Select-Object -First 1
    if (-not $line) { return $null }
    return $line.ToString()
}

$state = Get-BoardState
if (-not $state) {
    throw "No USB device with ID $HardwareId found. Is the board plugged in? Run 'usbipd list' to see devices."
}

# One-time: share the device with usbipd (needs admin).
if ($state -match "Not shared") {
    Write-Host "Sharing the board with usbipd (one-time, needs admin - accept the UAC prompt)..."
    $p = Start-Process usbipd -ArgumentList "bind", "--hardware-id", $HardwareId -Verb RunAs -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "usbipd bind failed (exit code $($p.ExitCode))." }
}

# Build first so the image exists for the device check below.
$env:SKETCH = $Sketch
$env:SERIAL_PORT = $SerialPort
docker compose build firmware
if ($LASTEXITCODE -ne 0) { throw "docker compose build failed." }

try {
    if ((Get-BoardState) -notmatch "Attached") {
        Write-Host "Attaching the board to WSL..."
        usbipd attach --wsl --hardware-id $HardwareId
        if ($LASTEXITCODE -ne 0) { throw "usbipd attach failed. Close anything using the COM port (Arduino IDE, serial monitor, bridge.py) and retry." }
    }

    # Wait for the serial device to show up inside Docker's VM.
    Write-Host "Waiting for $SerialPort..."
    $found = $false
    for ($i = 0; $i -lt 15; $i++) {
        docker run --rm --entrypoint test -v /dev:/hostdev canairy-firmware -e "/hostdev/$(Split-Path $SerialPort -Leaf)" 2>$null
        if ($LASTEXITCODE -eq 0) { $found = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $found) {
        throw "$SerialPort never appeared. If the board is a clone, try: .\scripts\flash.ps1 -SerialPort /dev/ttyUSB0"
    }

    docker compose run --rm firmware
}
finally {
    Write-Host "Giving the board back to Windows..."
    usbipd detach --hardware-id $HardwareId 2>$null
    Remove-Item Env:SKETCH, Env:SERIAL_PORT -ErrorAction SilentlyContinue
}
