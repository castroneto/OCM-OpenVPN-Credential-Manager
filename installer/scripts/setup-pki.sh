#!/bin/sh
# Idempotent OpenVPN + easy-rsa provisioning for OCM.
# Invoked by the .deb postinst. Safe to re-run.
set -eu

OVPN_DIR=/etc/openvpn/ocm
PKI_DIR="$OVPN_DIR/pki"
EASYRSA=/usr/share/easy-rsa/easyrsa
OCM_USER=ocm

if [ ! -x "$EASYRSA" ]; then
  echo "ERROR: easy-rsa not found at $EASYRSA" >&2
  exit 1
fi

VPN_HOST="${OCM_VPN_HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
VPN_PORT="${OCM_VPN_PORT:-1194}"
VPN_PROTO="${OCM_VPN_PROTO:-udp}"
VPN_NET="10.8.0.0"
VPN_MASK="255.255.255.0"

export EASYRSA_PKI="$PKI_DIR"
export EASYRSA_BATCH=1
# Long CRL validity; the API also regenerates it on boot and weekly.
export EASYRSA_CRL_DAYS="${OCM_CRL_DAYS:-3650}"

mkdir -p "$OVPN_DIR"

# --- PKI ---------------------------------------------------------------------
if [ ! -f "$PKI_DIR/ca.crt" ]; then
  echo "OCM: initialising PKI..."
  "$EASYRSA" init-pki
  "$EASYRSA" build-ca nopass
  "$EASYRSA" gen-dh
  "$EASYRSA" build-server-full server nopass
  "$EASYRSA" gen-crl
fi

# tls-crypt shared key
if [ ! -f "$OVPN_DIR/ta.key" ]; then
  openvpn --genkey secret "$OVPN_DIR/ta.key" 2>/dev/null \
    || openvpn --genkey --secret "$OVPN_DIR/ta.key"
fi

# --- server config -----------------------------------------------------------
# openvpn@ocm-server reads /etc/openvpn/ocm-server.conf (kept out of the PKI dir).
cat > /etc/openvpn/ocm-server.conf <<EOF
port $VPN_PORT
proto $VPN_PROTO
dev tun
ca $PKI_DIR/ca.crt
cert $PKI_DIR/issued/server.crt
key $PKI_DIR/private/server.key
dh $PKI_DIR/dh.pem
crl-verify $PKI_DIR/crl.pem
tls-crypt $OVPN_DIR/ta.key
server $VPN_NET $VPN_MASK
topology subnet
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS 1.1.1.1"
keepalive 10 120
cipher AES-256-GCM
auth SHA256
user nobody
group nogroup
persist-key
persist-tun
status /var/log/openvpn/ocm-status.log
verb 3
EOF

mkdir -p /var/log/openvpn

# --- client template (consumed by the API to build .ovpn profiles) ----------
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

# --- IP forwarding + NAT -----------------------------------------------------
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-ocm.conf
sysctl -p /etc/sysctl.d/99-ocm.conf >/dev/null 2>&1 || true

# NAT is best-effort: a missing iptables/ip (minimal Debian uses nftables) must
# not abort the install. Warn and let the admin wire routing if tools are absent.
if command -v iptables >/dev/null 2>&1 && command -v ip >/dev/null 2>&1; then
  WAN_IF="$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')"
  if [ -n "${WAN_IF:-}" ]; then
    if ! iptables -t nat -C POSTROUTING -s "$VPN_NET/24" -o "$WAN_IF" -j MASQUERADE 2>/dev/null; then
      iptables -t nat -A POSTROUTING -s "$VPN_NET/24" -o "$WAN_IF" -j MASQUERADE \
        || echo "OCM: WARN could not add NAT rule; configure VPN routing manually." >&2
    fi
  fi
else
  echo "OCM: WARN iptables/ip not found; skipping NAT (configure VPN routing manually)." >&2
fi

# --- permissions: let the ocm service manage the PKI -------------------------
chown -R "$OCM_USER":"$OCM_USER" "$OVPN_DIR"
chmod 0750 "$OVPN_DIR" "$PKI_DIR"

systemctl enable openvpn@ocm-server.service >/dev/null 2>&1 || true

echo "OCM: OpenVPN PKI provisioned ($VPN_PROTO://$VPN_HOST:$VPN_PORT)."
