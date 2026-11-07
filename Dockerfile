# syntax=docker/dockerfile:1
#
# One Dockerfile, several targets:
#   dashboard      -> builds the React app and serves it with nginx
#   firmware       -> compiles src/sketch.ino with arduino-cli; at runtime uploads it to a board
#   firmware-out   -> just the compiled .hex/.bin files (for flashing from the host)

########## Dashboard ##########
FROM node:24-alpine AS dashboard-build
# Extra CA certs (e.g. antivirus/corporate HTTPS inspection). See docker/certs/README.md.
COPY docker/certs/ /usr/local/share/ca-certificates/extra/
RUN cat /usr/local/share/ca-certificates/extra/*.crt > /etc/ssl/extra-ca.pem 2>/dev/null || true
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/extra-ca.pem
WORKDIR /app
COPY canairy-dashboard/package.json canairy-dashboard/package-lock.json ./
RUN npm ci
COPY canairy-dashboard/ ./
RUN npm run build

FROM nginx:1.27-alpine AS dashboard
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=dashboard-build /app/build /usr/share/nginx/html
EXPOSE 80

########## Firmware ##########
FROM debian:bookworm-slim AS firmware
ARG ARDUINO_CLI_VERSION=1.1.1
# Fully-qualified board name. Uno = arduino:avr:uno, Nano = arduino:avr:nano,
# Mega = arduino:avr:mega, ESP32 = esp32:esp32:esp32 (needs extra board URL).
ARG FQBN=arduino:avr:uno
ARG BOARD_MANAGER_URLS=""

# Extra CA certs (e.g. antivirus/corporate HTTPS inspection). See docker/certs/README.md.
COPY docker/certs/ /usr/local/share/ca-certificates/extra/
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && update-ca-certificates \
 && curl -fsSL "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
    | tar -xz -C /usr/local/bin arduino-cli

# Install the board core (e.g. arduino:avr) at build time so flashing works offline.
RUN arduino-cli config init \
 && if [ -n "$BOARD_MANAGER_URLS" ]; then arduino-cli config set board_manager.additional_urls "$BOARD_MANAGER_URLS"; fi \
 && arduino-cli core update-index \
 && arduino-cli core install "$(echo "$FQBN" | cut -d: -f1,2)"

# arduino-cli requires the folder name to match the .ino name, so place it in /sketch/sketch/.
WORKDIR /sketch
COPY src/ ./sketch/
# Compile during the build: `docker compose build` fails fast if the sketch doesn't compile.
RUN arduino-cli compile --fqbn "$FQBN" --output-dir /build ./sketch

COPY docker/flash.sh /usr/local/bin/flash
RUN sed -i 's/\r$//' /usr/local/bin/flash && chmod +x /usr/local/bin/flash
ENV FQBN=${FQBN} PORT=/dev/ttyACM0 BAUD=115200
ENTRYPOINT ["flash"]
CMD ["upload"]

FROM scratch AS firmware-out
COPY --from=firmware /build /
