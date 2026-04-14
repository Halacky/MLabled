#!/bin/sh
# Replace backend URL placeholder in nginx config
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
sed -i "s|proxy_pass .*backend.*|proxy_pass ${BACKEND_URL};|gi" /etc/nginx/conf.d/default.conf
sed -i "s|BACKEND_PLACEHOLDER|${BACKEND_URL}|g" /etc/nginx/conf.d/default.conf
echo "Nginx configured to proxy /api/ -> ${BACKEND_URL}"
