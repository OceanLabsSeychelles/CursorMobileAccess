# Security

CursorMobileAccess is a **self-hosted** bridge between your phone and a Cursor
Agents window on your PC. Treat the bridge like a remote control for your IDE.

## Threat model (short)

| Surface | Risk if exposed |
| --- | --- |
| Bridge WebSocket (`BRIDGE_HOST:BRIDGE_PORT`) | Anyone with the auth token can read the agent timeline and send commands |
| CDP (`127.0.0.1:9222`) | Full DevTools access to Cursor; must stay loopback-only |
| ntfy topic | Knowing the topic lets others receive your push notifications |

## Hard requirements

1. **Do not put the bridge on the public internet.** Bind to your Tailscale IP
   (or another private overlay), not `0.0.0.0` on a WAN interface.
2. **Use a strong `BRIDGE_AUTH_TOKEN`.** Never ship with `dev-change-me` or the
   example placeholder once the bridge is reachable from another device.
3. **Keep CDP on localhost.** Start Cursor with `--remote-debugging-port=9222`
   and do not port-forward `9222`.
4. **Never commit secrets.** Keep these out of git (already gitignored):
   - `.env`
   - `infra/ntfy/.env`
   - `infra/ntfy/topic.txt`
5. **ntfy topics are secrets.** Prefer a long random topic; anyone who knows it
   can subscribe when login is disabled.

## Reporting a vulnerability

If you find a security issue in this repository (auth bypass, accidental secret
leakage in docs/examples, unsafe defaults, etc.):

1. Prefer a **private** report to the maintainer (GitHub Security Advisory on
   the repo, or email the address listed on the GitHub profile / org).
2. Do **not** open a public issue that includes exploit details or live tokens.
3. Give a short description, affected component (bridge / web / Android), and
   steps to reproduce if possible.

## What this project does *not* claim

- It is **not** an official Cursor product and does not use a Cursor SDK.
- It drives the IDE through the Chrome DevTools Protocol and DOM extraction.
  Cursor’s terms of use still apply to your own Cursor account and install.
- Third-party packages (npm, AndroidX, Docker images such as ntfy) keep their
  own licenses and security processes; report issues upstream when appropriate.
