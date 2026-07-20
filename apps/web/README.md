# CursorMobileAccess web UI

Vite + React client built to `dist/` and served by the bridge on the same port as the WebSocket.

```powershell
npm run build -w @cursormobileaccess/web   # from repo root
# or
npm run build:web                          # builds protocol + web
```

The bridge serves `apps/web/dist` by default. See the root [README.md](../../README.md) and [docs/SETUP.md](../../docs/SETUP.md).
