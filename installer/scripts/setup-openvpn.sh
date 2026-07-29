#!/bin/sh
# Point OCM at an ALREADY-INSTALLED OpenVPN server. Idempotent.
#
# OCM manages the credentials of an existing deployment. It never creates a CA,
# never issues a server certificate, never writes a server config and never
# starts a VPN of its own. This script only:
#
#   * verifies OpenVPN and its easy-rsa PKI are present,
#   * derives a client profile template from the running server config,
#   * grants the `ocm` service account access to that PKI,
#   * writes the derived settings to $OCM_ETC/openvpn.env.
#
# It never touches iptables, sysctl, routing or any openvpn unit.
#
# Inputs (env): OCM_PKI_DIR, OCM_OPENVPN_DIR, OCM_VPN_HOST, OCM_SERVER_CONF,
#               OCM_ETC, OCM_EASYRSA_BIN
set -eu

PKI_DIR="${OCM_PKI_DIR:?OCM_PKI_DIR is required}"
OVPN_DIR="${OCM_OPENVPN_DIR:-/etc/openvpn}"
OCM_ETC="${OCM_ETC:-/etc/ocm}"
EASYRSA="${OCM_EASYRSA_BIN:-/usr/share/easy-rsa/easyrsa}"
OCM_USER=ocm
DERIVED_ENV="$OCM_ETC/openvpn.env"
TEMPLATE="$OCM_ETC/client-template.ovpn"

die() { echo "ERROR: $*" >&2; exit 1; }

# --- prerequisites -----------------------------------------------------------
command -v openvpn >/dev/null 2>&1 || die "OpenVPN is not installed.
OCM manages credentials for an existing OpenVPN server; it does not install one.
Install and configure OpenVPN first, then reconfigure OCM."

[ -x "$EASYRSA" ] || die "easy-rsa not found at $EASYRSA (install the easy-rsa package)."

# --- the PKI must already exist ----------------------------------------------
[ -f "$PKI_DIR/ca.crt" ] || die "No easy-rsa PKI found at $PKI_DIR (missing ca.crt).
OCM issues client certificates from your existing CA and never creates one.
Point OCM at the PKI of your OpenVPN server:
    dpkg-reconfigure ocm"

[ -f "$PKI_DIR/private/ca.key" ] || die "CA private key missing at $PKI_DIR/private/ca.key.
OCM needs the CA key to issue client certificates."

echo "OCM: adopting existing PKI at $PKI_DIR"

# --- locate the server config so the client profile matches it ---------------
# A server config is the one declaring `server <net> <mask>`; a client config
# never does. Search the usual layouts, honouring an explicit override.
find_server_conf() {
  [ -n "${OCM_SERVER_CONF:-}" ] && { echo "$OCM_SERVER_CONF"; return; }
  for candidate in \
    "$OVPN_DIR"/*.conf \
    "$OVPN_DIR"/server/*.conf \
    /etc/openvpn/*.conf \
    /etc/openvpn/server/*.conf
  do
    [ -f "$candidate" ] || continue
    if grep -qE '^[[:space:]]*server[[:space:]]+[0-9]' "$candidate"; then
      echo "$candidate"; return
    fi
  done
}

SERVER_CONF="$(find_server_conf || true)"

# Read a directive's first argument from the server config.
conf_get() {
  [ -n "$SERVER_CONF" ] || return 0
  sed -nE "s/^[[:space:]]*$1[[:space:]]+([^[:space:]#]+).*/\1/p" "$SERVER_CONF" \
    | head -1
}

if [ -n "$SERVER_CONF" ]; then
  echo "OCM: reading server settings from $SERVER_CONF"
else
  echo "OCM: WARN no server config found; using defaults. Review $TEMPLATE." >&2
fi

VPN_PORT="${OCM_VPN_PORT:-$(conf_get port)}";   VPN_PORT="${VPN_PORT:-1194}"
VPN_PROTO="${OCM_VPN_PROTO:-$(conf_get proto)}"; VPN_PROTO="${VPN_PROTO:-udp}"
# The server's `proto udpN/tcp-server` variants map to plain client protocols.
case "$VPN_PROTO" in
  tcp*) VPN_PROTO=tcp ;;
  udp*) VPN_PROTO=udp ;;
esac
VPN_CIPHER="$(conf_get cipher)"
VPN_AUTH="$(conf_get auth)"
VPN_HOST="${OCM_VPN_HOST:-}"
[ -n "$VPN_HOST" ] || VPN_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"

# --- control channel: tls-crypt vs tls-auth (they are not interchangeable) ---
resolve_tls_key() {
  raw="$1"
  case "$raw" in
    /*) echo "$raw" ;;
    *)  echo "$(dirname "$SERVER_CONF")/$raw" ;;
  esac
}

TLS_MODE=none
TLS_KEY=""
if [ -n "$SERVER_CONF" ]; then
  if key="$(conf_get tls-crypt)" && [ -n "$key" ]; then
    TLS_MODE=tls-crypt
    TLS_KEY="$(resolve_tls_key "$key")"
  elif key="$(conf_get tls-auth)" && [ -n "$key" ]; then
    TLS_MODE=tls-auth
    TLS_KEY="$(resolve_tls_key "$key")"
  fi
fi

if [ "$TLS_MODE" != none ] && [ ! -f "$TLS_KEY" ]; then
  echo "OCM: WARN $TLS_MODE key not found at $TLS_KEY; profiles will omit it." >&2
  TLS_MODE=none
  TLS_KEY=""
fi

echo "OCM: server is ${VPN_PROTO}://${VPN_HOST}:${VPN_PORT} (control channel: ${TLS_MODE})"

# --- client template ---------------------------------------------------------
# Written once; the admin owns it afterwards. On later runs a .new file is left
# alongside so an upgrade never silently rewrites a customised profile.
install -d -m 0750 "$OCM_ETC"
TARGET="$TEMPLATE"
[ -f "$TEMPLATE" ] && TARGET="$TEMPLATE.new"

{
  echo "# Base .ovpn profile for credentials issued by OCM."
  echo "# Derived from ${SERVER_CONF:-<no server config found>}."
  echo "# OCM appends the CA, the client certificate/key and the control-channel key."
  echo "client"
  echo "dev tun"
  echo "proto $VPN_PROTO"
  echo "remote $VPN_HOST $VPN_PORT"
  echo "resolv-retry infinite"
  echo "nobind"
  echo "persist-key"
  echo "persist-tun"
  echo "remote-cert-tls server"
  [ -n "$VPN_CIPHER" ] && echo "cipher $VPN_CIPHER"
  [ -n "$VPN_AUTH" ] && echo "auth $VPN_AUTH"
  echo "verb 3"
} > "$TARGET"
chmod 0644 "$TARGET"

if [ "$TARGET" != "$TEMPLATE" ]; then
  echo "OCM: kept your $TEMPLATE; new suggested template at $TARGET"
fi

# --- derived settings consumed by the API ------------------------------------
umask 022
cat > "$DERIVED_ENV" <<EOF
# Generated by setup-openvpn.sh - do not edit; run \`dpkg-reconfigure ocm\`.
OCM_PKI_DIR=$PKI_DIR
OCM_OPENVPN_DIR=$OVPN_DIR
OCM_EASYRSA_BIN=$EASYRSA
OCM_CLIENT_TEMPLATE=$TEMPLATE
OCM_TLS_MODE=$TLS_MODE
OCM_TLS_KEY_PATH=$TLS_KEY
EOF
chmod 0644 "$DERIVED_ENV"

# --- grant the service account access to the PKI -----------------------------
# easy-rsa rewrites index.txt, serial and the issued/private trees, so the group
# needs write access; ancestors only need traversal.
if getent passwd "$OCM_USER" >/dev/null; then
  chgrp -R "$OCM_USER" "$PKI_DIR"
  chmod -R g+rwX "$PKI_DIR"

  dir="$(dirname "$PKI_DIR")"
  while [ "$dir" != "/" ] && [ "$dir" != "/etc" ]; do
    chgrp "$OCM_USER" "$dir" || true
    chmod g+rx "$dir" || true
    dir="$(dirname "$dir")"
  done

  [ -n "$TLS_KEY" ] && [ -f "$TLS_KEY" ] && {
    chgrp "$OCM_USER" "$TLS_KEY" || true
    chmod g+r "$TLS_KEY" || true
  }
fi

# --- let the running OpenVPN re-read the CRL ---------------------------------
# OpenVPN drops to an unprivileged user (`user nobody`) and re-reads crl.pem on
# every connection. A PKI created by a typical easy-rsa setup is 0700, so after
# dropping privileges it cannot even stat the file: it logs
#   WARNING: Failed to stat CRL file, not reloading CRL
# and silently keeps using the copy loaded at startup. Revocations then appear
# to succeed while the revoked client still connects, until the service is
# restarted. Grant traversal only (o+x, never o+r) along the path to the CRL:
# directories cannot be listed and every secret inside keeps its own mode —
# private/ and issued/ stay 0770, so only the CRL, which is public, is exposed.
dir="$PKI_DIR"
while [ "$dir" != "/" ] && [ "$dir" != "/etc" ]; do
  chmod o+x "$dir" || true
  dir="$(dirname "$dir")"
done

# See EasyRsaService.ensureCrlReadable: same reason, for the file itself.
[ -f "$PKI_DIR/crl.pem" ] && chmod 0644 "$PKI_DIR/crl.pem"

echo "OCM: OpenVPN integration configured (no VPN was created or modified)."
