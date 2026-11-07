#!/bin/sh
# Usage (inside the firmware container):
#   flash upload    upload the precompiled sketch to $PORT, then open the serial monitor
#   flash compile   recompile (e.g. if you mounted a modified src/ into /sketch/sketch)
#   flash monitor   only open the serial monitor
#   flash boards    list detected boards/ports
set -e
cmd="${1:-upload}"

case "$cmd" in
  compile)
    arduino-cli compile --fqbn "$FQBN" --output-dir /build ./sketch
    ;;
  upload)
    if [ ! -e "$PORT" ]; then
      echo "Serial port $PORT not found in container. Is the board attached and passed with --device?" >&2
      arduino-cli board list
      exit 1
    fi
    arduino-cli upload --fqbn "$FQBN" --port "$PORT" --input-dir /build ./sketch
    echo "Upload complete. Opening serial monitor at ${BAUD} baud (Ctrl+C to exit)..."
    exec arduino-cli monitor --port "$PORT" --config "baudrate=${BAUD}"
    ;;
  monitor)
    exec arduino-cli monitor --port "$PORT" --config "baudrate=${BAUD}"
    ;;
  boards)
    arduino-cli board list
    ;;
  *)
    exec "$@"
    ;;
esac
