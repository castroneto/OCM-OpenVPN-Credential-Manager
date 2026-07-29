# Security notes

The system is intentionally small. Every design choice favours a reduced attack
surface over features.

## Input validation

- A **DTO is mandatory** on every route — body, params and query.
- The global pipe rejects anything outside the schema:

  ```ts
  new ValidationPipe({
    whitelist: true, // strip unknown properties
    forbidNonWhitelisted: true, // ...and reject the request if present
    transform: true, // coerce to the DTO instance
    forbidUnknownValues: true, // reject unresolved payloads
  });
  ```

- Types are precise. The codebase forbids `any`, `object` and
  `Record<string, any>`; identifiers use `@IsUUID()`, pagination uses
  `@IsInt()` + `@Type(() => Number)`, so `?page=abc` is rejected.

## Command execution

- **No shell, ever.** PKI tooling runs through `execFile(bin, [args])`.
- No `exec`, no `bash -c`, no string interpolation of user input into commands.
- Common names are constrained by regex (`^[a-z0-9][a-z0-9._-]{0,63}$`) at the
  DTO layer and re-checked in `EasyRsaService`, blocking shell metacharacters,
  leading dashes (flag injection) and `..` (path traversal).

## Authentication & authorisation

- Single role: `ADMIN`. Auth + role guards run globally; public routes opt in.
- **No default credentials.** The system starts with zero admins; the first is
  created locally with `ocm-admin create`. There is never a shipped password.
- **Brute-force lockout.** After `OCM_LOGIN_MAX_ATTEMPTS` consecutive failures
  (default 5) a username is locked for `OCM_LOGIN_LOCK_SECONDS` (default 900s)
  and login returns `429`. A successful login resets the counter.
- Passwords: scrypt (`node:crypto`), stored as `scrypt$N$r$p$salt$hash`, verified
  in constant time. Login runs a dummy verification for unknown users to keep
  timing uniform.
- JWT HS256, per-install secret (≥ 32 chars, validated at boot), short TTL
  (default 30 min).
- **Session revocation.** The auth guard re-checks on every request that the
  admin still exists, so deleting an admin invalidates their token immediately.
  Password-change invalidation is bounded by the short TTL — deliberately no
  token-version bookkeeping (simplicity over a marginal gain).

## Secrets & configuration

- `OCM_JWT_SECRET` is generated per install (`openssl rand -hex 32`) and stored
  in `/etc/ocm/ocm.env` with mode `0640`, owner `ocm`.
- Config is validated at startup; a missing/short secret aborts boot.

## Service hardening (systemd)

`ocm-api.service` runs as the unprivileged `ocm` user with `NoNewPrivileges`,
`PrivateTmp`, `ProtectSystem=full`, `ProtectHome`, a narrow `ReadWritePaths`
(`/var/lib/ocm` plus the adopted PKI, granted by a package drop-in), and only
`CAP_NET_BIND_SERVICE` (so it can listen on port 80 without root).

## PKI access (adopting an existing CA)

The installer grants the `ocm` group read/write on the PKI it adopts, because
issuing and revoking means easy-rsa rewriting `index.txt`, `serial` and the
`issued/` and `private/` trees.

This necessarily includes **`private/ca.key`** — signing new client
certificates is impossible without it. So the trust boundary is explicit:
**compromising the OCM service means compromising the CA.** That is inherent to
any tool that issues certificates, not a property of this one. Treat the console
as a CA administration interface: keep it off public interfaces, behind TLS, and
limit who holds an admin account.

Client private keys are likewise readable by the service, since it inlines them
into `.ovpn` profiles. Nothing outside the PKI directory is granted.

## Client key passphrases

A credential's private key can be encrypted with a passphrase at issuance. The
passphrase is piped to `openssl` over **stdin** — never a command-line argument
(visible in `ps`), never an environment variable, never written to disk or to
the database. Only the boolean `has_password` is stored. It cannot be recovered:
a lost passphrase means revoking and reissuing.

## HTTP headers & body limits

A single NestJS process serves the API and the console (no nginx). `helmet`
sets the security headers, including a strict Content-Security-Policy:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

(`'unsafe-inline'` is limited to `style-src`, required by Radix Themes; scripts
stay same-origin.) Request bodies are capped at 32 kB and the HTTP server sets
`requestTimeout`/`headersTimeout` as a basic slowloris mitigation.

## CRL availability

Revocation only works while the CRL is valid — an expired CRL makes OpenVPN
reject every client. OCM regenerates the CRL on revoke, on each API boot, and
weekly, and issues it with a long validity (`OCM_CRL_DAYS`, default 3650). This
is an availability control, not a secrecy one.

The same applies to its **permissions**. OpenVPN re-reads `crl.pem` on every
connection, but by then it has dropped to an unprivileged user (`user nobody`),
while easy-rsa writes files with `umask 077`. Left alone, the first refresh
would make the server unable to read its own CRL and it would reject _every_
client. OCM therefore restores mode `0644` after each regeneration — a CRL is
public data, so this discloses nothing.

## Transport

- The console binds to `OCM_BIND_ADDR` (default `0.0.0.0`; restrict to the VPN
  NIC or `127.0.0.1` to limit exposure).
- Traffic is plain HTTP by default — intended for a trusted internal/VPN
  segment. **Put a TLS reverse proxy in front** (e.g. Caddy/Let's Encrypt)
  before exposing the console beyond that boundary.
