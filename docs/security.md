# Security

Security protects the single-owner account, broker credentials, trading data, source data, and audit trail. SignalGuard must be safe by design because it handles sensitive financial workflow data even though the MVP is paper trading only.

## Key requirements

- **Single-user system.** Public registration is disabled; the owner is created with `pnpm create-owner`.
- **Strong authentication.** Support email/password, TOTP MFA, recovery codes, password reset, session management, and session revocation.
- **Step-up MFA is required** for broker credential changes, enabling paper-order execution, weakening risk controls, resetting Emergency Stop, and regenerating recovery codes.
- **Never store passwords or MFA secrets in plaintext.**
- **Never commit secrets.** Secrets belong in Git-ignored `.env`, Codespaces secrets, host environment variables, or managed secrets services.
- **Use standard web protections:** secure password hashing, HTTP-only cookies, CSRF protection, input validation, output encoding, CSP, rate limiting, encryption in transit and at rest, signed webhooks, and secret rotation.
- **Use least privilege.** Broker credentials are reachable only by the restricted trading service.
- **Audit sensitive events.** Authentication changes, risk changes, broker actions, Emergency Stop, and agent permission decisions must be recorded.

## Text diagram

```
Owner Browser
    |
    v
Secure Web Portal
    |
    +--> Auth + MFA + Session Controls
    +--> Audit Log
    +--> PostgreSQL
    |
    v
Restricted Service Boundary
    |
    v
Broker Secrets -> Alpaca Paper Only
```

## Owner secret-handling rule

No one should ask the owner to paste API keys, database passwords, broker secrets, MFA secrets, recovery codes, session secrets, encryption keys, or private SSH keys into chat. Those values go only into trusted settings screens, host environment variables, managed secret stores, or the owner's password manager.
