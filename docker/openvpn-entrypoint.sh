#!/bin/sh
# Starts the OpenVPN server against the PKI created by the OCM API container.
set -eu

OVPN_DIR="${OCM_OPENVPN_DIR:-/data/openvpn}"
PKI_DIR="${OCM_PKI_DIR:-$OVPN_DIR/pki}"
EASYRSA=/usr/share/easy-rsa/easyrsa
VPN_PORT="${OCM_VPN_PORT:-1194}"
VPN_PROTO="${OCM_VPN_PROTO:-udp}"

export EASYRSA_PKI="$PKI_DIR"
export EASYRSA_BATCH=1

# Wait for the API to provision the PKI on first boot.
echo "OpenVPN: waiting for PKI at $PKI_DIR ..."
while [ ! -f "$PKI_DIR/ca.crt" ] || [ ! -f "$PKI_DIR/issued/server.crt" ]; do
  sleep 2
done

# Diffie-Hellman params are only needed by the server (slow; generate once).
if [ ! -f "$PKI_DIR/dh.pem" ]; then
  echo "OpenVPN: generating DH parameters (one-time, may take a while)..."
  "$EASYRSA" gen-dh
fi

cat > "$OVPN_DIR/server.conf" <<EOF
port $VPN_PORT
proto $VPN_PROTO
dev tun
ca $PKI_DIR/ca.crt
cert $PKI_DIR/issued/server.crt
key $PKI_DIR/private/server.key
dh $PKI_DIR/dh.pem
crl-verify $PKI_DIR/crl.pem
tls-crypt $OVPN_DIR/ta.key
server 10.8.0.0 255.255.255.0
topology subnet
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS 1.1.1.1"
keepalive 10 120
cipher AES-256-GCM
auth SHA256
persist-key
persist-tun
verb 3
EOF

# Ensure the tun device exists (host must pass /dev/net/tun + NET_ADMIN).
mkdir -p /dev/net
if [ ! -c /dev/net/tun ]; then
  mknod /dev/net/tun c 10 200 || true
fi

# NAT for VPN clients.
iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE 2>/dev/null || true

echo "OpenVPN: starting server ($VPN_PROTO/$VPN_PORT)..."
exec openvpn --config "$OVPN_DIR/server.conf"
