#!/bin/sh
# Substitui __RESOLVER__ pelo nameserver do ambiente (roda após o envsubst do nginx)
set -e
RESOLVER=$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)
[ -n "$RESOLVER" ] || RESOLVER=127.0.0.11
case "$RESOLVER" in
  *:*) RESOLVER="[$RESOLVER]" ;;
esac
sed -i "s|__RESOLVER__|$RESOLVER|g" /etc/nginx/conf.d/default.conf
echo "[scientia-saas] nginx resolver: $RESOLVER"
