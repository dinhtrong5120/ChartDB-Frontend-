#!/bin/sh

# Replace placeholders in nginx.conf
envsubst '${API_BASE_URL} ${HIDE_CHARTDB_CLOUD} ${DISABLE_ANALYTICS}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start Nginx
nginx -g "daemon off;"
