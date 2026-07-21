#!/bin/sh
# OCM API container entrypoint.
# Provisions a minimal PKI + client template on first boot (so credential
# issuing works out of the box), runs migrations, then starts the API.
set -eu

OVPN_DIR="${OCM_OPENVPN_DIR:-/data/openvpn}"
PKI_DIR="${OCM_PKI_DIR:-$OVPN_DIR/pki}"
EASYRSA="${OCM_EASYRSA_BIN:-/usr/share/easy-rsa/easyrsa}"

VPN_HOST="${OCM_VPN_HOST:-localhost}"
VPN_PORT="${OCM_VPN_PORT:-1194}"
VPN_PROTO="${OCM_VPN_PROTO:-udp}"

DB_PATH="${OCM_DATABASE_PATH:-/data/ocm.sqlite}"

# Drop privileges: started as root only to make the data volume writable by the
# unprivileged ocm user, then re-exec as ocm so the PKI, migrations and the API
# all run non-root. A fresh named volume is root-owned, hence the chown here.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$OVPN_DIR" "$(dirname "$DB_PATH")"
  chown -R ocm:ocm /data
  exec gosu ocm "$0" "$@"
fi

export EASYRSA_PKI="$PKI_DIR"
export EASYRSA_BATCH=1
# Long CRL validity; the API also regenerates it on boot and weekly.
export EASYRSA_CRL_DAYS="${OCM_CRL_DAYS:-3650}"

mkdir -p "$OVPN_DIR"

if [ ! -f "$PKI_DIR/ca.crt" ]; then
  echo "OCM: initialising PKI (first boot)..."
  "$EASYRSA" init-pki
  "$EASYRSA" build-ca nopass
  "$EASYRSA" build-server-full server nopass
  "$EASYRSA" gen-crl
fi

if [ ! -f "$OVPN_DIR/ta.key" ]; then
  openvpn --genkey secret "$OVPN_DIR/ta.key" 2>/dev/null \
    || openvpn --genkey --secret "$OVPN_DIR/ta.key"
fi

if [ ! -f "$OVPN_DIR/client-template.ovpn" ]; then
  cat > "$OVPN_DIR/client-template.ovpn" <<EOF
client
dev tun
proto $VPN_PROTO
remote $VPN_HOST $VPN_PORT
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
verb 3
EOF
fi

echo "OCM: applying database migrations..."
node dist/database/migrate.js

echo "OCM: starting API on port ${OCM_PORT:-3000}..."
exec node dist/main.js
