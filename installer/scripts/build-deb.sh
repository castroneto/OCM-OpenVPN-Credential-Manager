#!/usr/bin/env bash
# Build the OCM .deb package.
#
# Usage: installer/scripts/build-deb.sh [version]
# Version defaults to the root package.json version. Produces
# dist/ocm_<version>_<arch>.deb at the repo root.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

VERSION="${1:-$(node -p "require('./package.json').version")}"
VERSION="${VERSION#v}"
ARCH="$(dpkg --print-architecture 2>/dev/null || echo amd64)"

BUILD_DIR="$ROOT_DIR/installer/debian/build"
STAGE="$BUILD_DIR/ocm"
OUT_DIR="$ROOT_DIR/dist"
DEB_NAME="ocm_${VERSION}_${ARCH}.deb"

echo ">> Building OCM ${VERSION} (${ARCH})"

rm -rf "$BUILD_DIR"
mkdir -p "$STAGE/DEBIAN" \
         "$STAGE/opt/ocm" \
         "$STAGE/opt/ocm/web" \
         "$STAGE/opt/ocm/installer" \
         "$STAGE/etc/systemd/system" \
         "$STAGE/usr/bin"

# apps/cli is deployed self-contained to /opt/ocm/cli (see below).

# --- build workspace ---------------------------------------------------------
echo ">> Installing dependencies"
pnpm install --frozen-lockfile=false

echo ">> Building packages and apps"
pnpm run build

# --- API: self-contained production deployment -------------------------------
echo ">> Deploying API (production dependencies)"
pnpm --filter @ocm/api --legacy deploy --prod "$STAGE/opt/ocm/api"

# --- CLI: self-contained production deployment -------------------------------
echo ">> Deploying CLI (production dependencies)"
pnpm --filter @ocm/cli --legacy deploy --prod "$STAGE/opt/ocm/cli"

# --- Web: static build -------------------------------------------------------
echo ">> Copying web build"
cp -r "$ROOT_DIR/apps/web/dist/." "$STAGE/opt/ocm/web/"

# --- installer helpers -------------------------------------------------------
cp "$ROOT_DIR/installer/scripts/setup-pki.sh"   "$STAGE/opt/ocm/installer/setup-pki.sh"
chmod 0755 "$STAGE/opt/ocm/installer/setup-pki.sh"

# --- ocm-admin CLI wrapper ---------------------------------------------------
cp "$ROOT_DIR/installer/scripts/ocm-admin" "$STAGE/usr/bin/ocm-admin"
chmod 0755 "$STAGE/usr/bin/ocm-admin"

# --- systemd -----------------------------------------------------------------
cp "$ROOT_DIR/installer/systemd/ocm-api.service" \
   "$STAGE/etc/systemd/system/ocm-api.service"

# --- Debian control files ----------------------------------------------------
sed "s/^Version: .*/Version: ${VERSION}/; s/^Architecture: .*/Architecture: ${ARCH}/" \
  "$ROOT_DIR/installer/debian/control" > "$STAGE/DEBIAN/control"
cp "$ROOT_DIR/installer/debian/templates" "$STAGE/DEBIAN/templates"
cp "$ROOT_DIR/installer/debian/config"    "$STAGE/DEBIAN/config"
cp "$ROOT_DIR/installer/debian/postinst"  "$STAGE/DEBIAN/postinst"
cp "$ROOT_DIR/installer/debian/prerm"     "$STAGE/DEBIAN/prerm"
cp "$ROOT_DIR/installer/debian/postrm"    "$STAGE/DEBIAN/postrm"
chmod 0755 "$STAGE/DEBIAN/config" "$STAGE/DEBIAN/postinst" \
           "$STAGE/DEBIAN/prerm" "$STAGE/DEBIAN/postrm"

# --- assemble ----------------------------------------------------------------
mkdir -p "$OUT_DIR"
dpkg-deb --root-owner-group --build "$STAGE" "$OUT_DIR/$DEB_NAME"

echo ">> Built $OUT_DIR/$DEB_NAME"
