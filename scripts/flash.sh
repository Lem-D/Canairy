#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./scripts/flash.sh [options]

Compile firmware in Docker, then upload it through Arduino CLI on macOS.

Options:
  -s, --sketch NAME  Sketch to flash: receiver or wearable (default: receiver)
  -p, --port PATH    Serial port (default: auto-detect /dev/cu.*)
  -f, --fqbn FQBN    Fully qualified board name (default: arduino:avr:mega for
                     the receiver, arduino:avr:uno for a wearable)
      --no-monitor   Do not open the serial monitor after uploading
  -h, --help         Show this help
EOF
}

sketch=receiver
serial_port=
fqbn=
monitor=true

while [[ $# -gt 0 ]]; do
    case "$1" in
        -s|--sketch)
            [[ $# -ge 2 ]] || { echo "Missing value for $1." >&2; exit 2; }
            sketch=$2
            shift 2
            ;;
        -p|--port)
            [[ $# -ge 2 ]] || { echo "Missing value for $1." >&2; exit 2; }
            serial_port=$2
            shift 2
            ;;
        -f|--fqbn)
            [[ $# -ge 2 ]] || { echo "Missing value for $1." >&2; exit 2; }
            fqbn=$2
            shift 2
            ;;
        --no-monitor)
            monitor=false
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

case "$sketch" in
    receiver|wearable) ;;
    *)
        echo "Sketch must be 'receiver' or 'wearable'." >&2
        exit 2
        ;;
esac

if [[ -z "$fqbn" ]]; then
    if [[ "$sketch" == receiver ]]; then fqbn=arduino:avr:mega; else fqbn=arduino:avr:uno; fi
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This script is for macOS. Use scripts/flash.ps1 on Windows." >&2
    exit 1
fi

command -v docker >/dev/null 2>&1 || {
    echo "Docker is required but was not found in PATH." >&2
    exit 1
}
command -v arduino-cli >/dev/null 2>&1 || {
    echo "Arduino CLI is required. Install it with: brew install arduino-cli" >&2
    exit 1
}

if [[ -z "$serial_port" ]]; then
    ports=(/dev/cu.*)
    if [[ ! -e "${ports[0]}" ]]; then
        echo "No macOS serial port found. Connect the board or use --port /dev/cu.usbmodemXXXX." >&2
        exit 1
    fi
    if [[ ${#ports[@]} -ne 1 ]]; then
        echo "Multiple serial ports found; specify one with --port:"
        printf '  %s\n' "${ports[@]}"
        exit 2
    fi
    serial_port=${ports[0]}
fi

if [[ ! -e "$serial_port" ]]; then
    echo "Serial port not found: $serial_port" >&2
    exit 1
fi

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

build_dir=$(mktemp -d "${TMPDIR:-/tmp}/canairy-firmware.XXXXXX")
cleanup() {
    rm -rf "$build_dir"
}
trap cleanup EXIT

echo "Compiling $sketch in Docker..."
docker build \
    --platform linux/amd64 \
    --target firmware-out \
    --build-arg "FQBN=$fqbn" \
    --build-arg "SKETCH=$sketch" \
    --output "type=local,dest=$build_dir" \
    .

echo "Uploading $sketch to $serial_port..."
arduino-cli upload \
    --fqbn "$fqbn" \
    --port "$serial_port" \
    --input-dir "$build_dir" \
    "src/$sketch"

if [[ "$monitor" == true ]]; then
    echo "Opening serial monitor at 115200 baud (Ctrl+C to exit)..."
    exec arduino-cli monitor --port "$serial_port" --config baudrate=115200
fi
