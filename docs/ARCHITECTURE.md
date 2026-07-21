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
vpn_credentials(id, common_name, description, status, created_at,
                revoked_at, expires_at)
```

The system starts with **zero** `admin_users`; the first row is created by the
`ocm-admin` CLI. Certificates/keys are not stored in SQLite.

## Deployment topology (.deb)

```
ocm-api (systemd, user "ocm")  ─▶  :HTTP_PORT  serves both:
    • /            → SPA from /opt/ocm/web  (@nestjs/serve-static)
    • /api/*       → NestJS API
openvpn@ocm-server  ─▶  /etc/openvpn/ocm-server.conf  (PKI in /etc/openvpn/ocm)
ocm-admin           ─▶  /usr/bin/ocm-admin → /opt/ocm/cli/dist/main.js
```

There is **no nginx**: a single NestJS process serves the API and the static
console, bound to `OCM_BIND_ADDR` on `OCM_PORT`. The unit grants only
`CAP_NET_BIND_SERVICE` so the unprivileged `ocm` user can listen on port 80.
OpenVPN is expected to be already installed; the installer verifies it rather
than pulling it in. There is no dnsmasq — clients are pushed a public resolver.

### Session revocation

JWTs are short-lived (default 30 min). On every authenticated request the
`JwtAuthGuard` confirms the admin still exists, so **deleting an admin
invalidates their token immediately**. Password-change invalidation is bounded
by the short TTL (kept simple — no token-version bookkeeping).
