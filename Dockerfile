# syntax=docker/dockerfile:1
#
# Builds the React dashboard and serves it with nginx.

########## Dashboard ##########
FROM node:24-alpine AS dashboard-build
WORKDIR /app
COPY canairy-dashboard/package.json canairy-dashboard/package-lock.json ./
RUN npm ci
COPY canairy-dashboard/ ./
RUN npm run build

FROM nginx:1.27-alpine AS dashboard
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=dashboard-build /app/build /usr/share/nginx/html
EXPOSE 80

