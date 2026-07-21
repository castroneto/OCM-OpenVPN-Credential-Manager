# OCM – OpenVPN Credential Manager

A secure, minimal admin panel to **issue and revoke OpenVPN client credentials**
for an **existing OpenVPN server**. One job, done well. Focus: **security,
simplicity, functionality**.

- **API** — NestJS + `better-sqlite3`, admin-only, every route validated by DTOs,
  login brute-force lockout.
- **Web** — React + Vite + `@radix-ui/themes`.
- **CLI** — `ocm-admin` creates/resets admins locally. The system starts with
  **no admin**; you bootstrap the first one from the machine.
- **Installer** — a `.deb` that **verifies OpenVPN is installed** (it does not
  install it) and provisions the PKI, with interactive first-run config. The
  NestJS service serves both the API and the console — no nginx.

---

## Architecture

```
┌────────────┐     /api      ┌──────────────┐    execFile     ┌───────────┐
│  React web │ ─────────────▶│  NestJS API  │ ──────────────▶ │  easy-rsa │
│ (radix-ui) │◀───────────── │ better-sqlite│                 │  (PKI)    │
└────────────┘  JWT (Bearer) └──────────────┘                 └───────────┘
   served by the same          systemd: ocm-api        openvpn@ocm-server
   NestJS process (no nginx)                            (existing openvpn)

  ocm-admin CLI ─▶ same SQLite file (create / reset / list admins)
```

- The API is the only component that touches the PKI. It shells out to
  `easy-rsa` **only via `execFile` with argument arrays** — never a shell,
  never string interpolation.
- SQLite stores admin accounts and credential metadata. Certificates/keys live
  in the OpenVPN PKI on disk, never in the database.

## Project layout

```
apps/
  api/          NestJS API (auth + lockout, admins, vpn)
  web/          React + Vite console
  cli/          ocm-admin — standalone admin CLI (better-sqlite3 only)
installer/
  debian/       control, maintainer scripts, debconf templates
  scripts/      build-deb.sh, setup-pki.sh, ocm-admin
  systemd/      ocm-api.service
docker/         Dockerfiles + compose (evaluation)
docs/           architecture & security notes
```

No shared `packages/` — the app is small enough that the API and web each keep
their own local types. Simplicity over layering.

## Get started (server deployment via .deb)

Target: a Debian/Ubuntu server (amd64) that **already runs OpenVPN**.

1. **Download the package** from the GitHub Release (built by the release
   workflow), or build it yourself (below).

2. **Install it.** APT resolves `easy-rsa`, `nodejs`. The installer aborts if
   OpenVPN is missing:

   ```bash
   sudo apt install ./ocm_<version>_amd64.deb
   ```

3. **Answer the interactive setup** (debconf): public host/IP, OpenVPN port &
   protocol, HTTP port for the console.

4. **Create the first administrator** (the system ships with none):

   ```bash
   sudo ocm-admin create admin
   # prompts for a password (min 12 chars), hidden input
   ```

5. **Open the console** at `http://<server>:<http_port>` and sign in. Create a
   credential → a ready-to-use `.ovpn` profile downloads immediately.

### ocm-admin CLI

Runs locally against the OCM database:

```bash
sudo ocm-admin create <username>          # create an admin
sudo ocm-admin reset-password <username>  # rotate a password
sudo ocm-admin list                       # list admins
sudo ocm-admin delete <username>          # remove an admin
```

### Build the .deb yourself

```bash
pnpm install
bash installer/scripts/build-deb.sh 0.1.0
# -> dist/ocm_0.1.0_amd64.deb
```

Requires `dpkg-deb` (from `dpkg-dev`) and `pnpm`. Build on amd64 so the
`better-sqlite3` native binary matches the target.

## Local development

Prerequisites: Node ≥ 20, pnpm 10.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set a 32+ char OCM_JWT_SECRET
pnpm dev                                 # API (:3000) + web (:5173)
```

Create a local admin (schema is created by the API/migrate first):

```bash
pnpm --filter @ocm/api migrate         # ensure the SQLite schema exists
pnpm --filter @ocm/cli admin create admin
```

Credential issuing needs `easy-rsa`/`openvpn` installed locally with
`OCM_PKI_DIR` / `OCM_EASYRSA_BIN` / `OCM_OPENVPN_DIR` pointing at a PKI.

## Docker (evaluation)

```bash
docker compose -f docker/docker-compose.yml up --build
# create the first admin (run as the non-root ocm user, the CLI is bundled):
docker compose -f docker/docker-compose.yml exec -u ocm api node cli/main.js create admin
# web console -> http://localhost:8080
```

Docker is for evaluating the API + console (PKI is auto-provisioned). Real VPN
deployment uses the `.deb` on your existing OpenVPN host.

## Security highlights

- **Admin only.** One role, guards enforced globally, `@Public()` to opt out.
- **Login lockout.** After `OCM_LOGIN_MAX_ATTEMPTS` (default 5) failures a
  username is locked for `OCM_LOGIN_LOCK_SECONDS` (default 15 min).
- **Everything is a DTO.** Body, params (`:id` → UUID), and query all validated
  with `whitelist + forbidNonWhitelisted + forbidUnknownValues`.
- **No shell.** PKI tools run via `execFile` + argument arrays. No `exec`,
  no `bash -c`, no interpolation.
- **Passwords** hashed with scrypt (`node:crypto`), constant-time verify.
- **Token revocation.** Deleting an admin invalidates their JWT on the next
  request; short token TTL (default 30 min) bounds any residual access.
- **CRL never expires.** The CRL is refreshed on boot and weekly (and issued
  with a long validity), so revocation stays enforced and OpenVPN never locks
  out every client on an expired list.
- **Hardened headers.** `helmet` + a strict Content-Security-Policy applied to
  the console (served by the same process); small request-body limit.
- **Config validated at boot** — refuses to start on a weak/missing secret.

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[MIT](LICENSE) © 2026 Castro Neto
