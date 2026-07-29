# Architecture

## Overview

Three apps, no shared packages — the system is small enough that each app keeps
its own local types. Its single responsibility is managing OpenVPN client
credentials, guarded by an admin-only panel, for an **already-installed**
OpenVPN server.

```
apps/api   NestJS API (owns the SQLite schema)
apps/web   React console (talks to /api)
apps/cli   ocm-admin — standalone admin CLI on the same SQLite file
```

`apps/cli` depends only on `better-sqlite3` (no NestJS). It carries its own
password hashing that is _format-compatible_ with the API's verifier
(`scrypt$N$r$p$salt$hash`), so there is no shared package and no heavy
dependency drag.

## API modules

| Module     | Responsibility                                                |
| ---------- | ------------------------------------------------------------- |
| `config`   | Loads + validates `AppConfig` from env once at boot.          |
| `database` | Owns the single `better-sqlite3` connection; runs schema.     |
| `auth`     | Login (JWT) + in-memory brute-force lockout, password change. |
| `admins`   | CRUD for panel administrators (the only user type).           |
| `vpn`      | Issue / revoke credentials, build `.ovpn` profiles.           |

The `ocm-admin` CLI lives in its own app (`apps/cli`), not in the API.

### Request lifecycle

1. `JwtAuthGuard` (global) verifies the Bearer token unless `@Public()`.
2. `RolesGuard` (global) requires `ADMIN`.
3. `ValidationPipe` (global) validates and whitelists the DTO.
4. Controller → Service → Repository (prepared statements) / `EasyRsaService`.
5. `HttpExceptionFilter` serialises errors; unknown errors are logged
   server-side and never leak internals.

### Login lockout

`LoginThrottleService` keeps an in-memory count of consecutive failures per
username. After `loginMaxAttempts` it locks that username for
`loginLockSeconds` and login returns `429`. A success resets the counter.
State is per process (resets on restart) — deliberately simple.

### PKI integration

`EasyRsaService` is the only path to the PKI. It validates the common name
(defence in depth), serialises operations, invokes `easyrsa` with
`execFile(bin, [args...])` and an explicit env, and assembles inline `.ovpn`
profiles from the template + CA + client cert/key + `tls-crypt` key.

### CRL refresh

The CRL is regenerated on revoke, on every API boot, and weekly (`CrlRefreshService`
via `@nestjs/schedule`). Combined with a long `OCM_CRL_DAYS` (default 3650) this
prevents the classic outage where an expired CRL makes OpenVPN reject _all_
clients. OpenVPN 2.4+ re-reads `crl.pem` per connection, so refreshing the file
needs no server reload and never drops active sessions.

## Data model

```
admin_users(id, username, password_hash, role, created_at, updated_at)
vpn_credentials(id, name, common_name, description, status, created_at,
                revoked_at, expires_at, has_password)
```

The system starts with **zero** `admin_users`; the first row is created by the
`ocm-admin` CLI. Certificates/keys are not stored in SQLite — `has_password`
only records _whether_ a key is passphrase-encrypted, never the passphrase.

Since the CA predates OCM, `ocm-admin import-clients` back-fills
`vpn_credentials` from the CA's `index.txt` (skipping the server certificate,
identified by its `serverAuth` extended key usage). It writes metadata rows
only; the PKI is read-only to it.

## Deployment topology (.deb)

```
ocm-api (systemd, user "ocm")  ─▶  :HTTP_PORT  serves both:
    • /            → SPA from /opt/ocm/web  (@nestjs/serve-static)
    • /api/*       → NestJS API
your openvpn server ─▶ untouched; OCM only reads its config and writes its PKI
ocm-admin           ─▶  /usr/bin/ocm-admin → /opt/ocm/cli/dist/main.js
```

There is **no nginx**: a single NestJS process serves the API and the static
console, bound to `OCM_BIND_ADDR` on `OCM_PORT`. The unit grants only
`CAP_NET_BIND_SERVICE` so the unprivileged `ocm` user can listen on port 80.

### Adopting an existing OpenVPN

The installer **attaches to a VPN that is already running** — it never creates a
CA, a server certificate, a server config or a systemd unit for OpenVPN, and it
touches neither routing (`sysctl`, `iptables`) nor the firewall.

`setup-openvpn.sh` locates the server config (the one declaring `server <net>`),
derives the settings a client must mirror — protocol, port, cipher, auth and the
control-channel mode — and writes them to `/etc/ocm/openvpn.env`, which the
service loads alongside `ocm.env`:

| Variable              | Meaning                                             |
| --------------------- | --------------------------------------------------- |
| `OCM_PKI_DIR`         | The adopted easy-rsa PKI.                           |
| `OCM_CLIENT_TEMPLATE` | Base `.ovpn`, derived once then owned by the admin. |
| `OCM_TLS_MODE`        | `tls-crypt`, `tls-auth` or `none`.                  |
| `OCM_TLS_KEY_PATH`    | The control-channel key.                            |

`tls-auth` and `tls-crypt` are **not interchangeable**: a `tls-auth` server
rejects a `tls-crypt` profile. `tls-auth` is also directional, so the client
side gets `key-direction 1`. Getting this wrong yields profiles that fail only
at connect time, which is why it is derived rather than assumed.

Because the PKI sits outside the unit's `ReadWritePaths` (and `ProtectSystem=full`
makes `/etc` read-only), the package writes a drop-in granting exactly that path.

### Session revocation

JWTs are short-lived (default 30 min). On every authenticated request the
`JwtAuthGuard` confirms the admin still exists, so **deleting an admin
invalidates their token immediately**. Password-change invalidation is bounded
by the short TTL (kept simple — no token-version bookkeeping).
