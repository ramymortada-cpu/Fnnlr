# fnnlr — Domain / SSL Checklist

- [ ] App domain (e.g. `app.your-domain.com`) → `APP_BASE_URL`.
- [ ] API domain (e.g. `api.your-domain.com`) → `API_BASE_URL`.
- [ ] CORS / allowed origins set to the app + public page domains only.
- [ ] SSL/TLS certificate valid on every public host.
- [ ] HSTS decision made (enable once HTTPS is confirmed everywhere).
- [ ] Public page base URL correct (hosted offer pages).
- [ ] Tracked link base URL correct (WhatsApp links resolve to the right host).
- [ ] Webhook callback URLs registered with each provider (server-side, signed).
- [ ] Customer-facing URLs use the public domain, not internal hosts.
- [ ] robots / noindex: private/admin pages noindexed; public offer pages indexable
      per the customer's choice.

Verify after DNS/SSL:
```
npm run deploy:health-gate
npm run deploy:smoke
```
