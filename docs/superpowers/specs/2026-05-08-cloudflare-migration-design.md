# Cloudflare Migration Design

**Date:** 2026-05-08
**Topic:** Migrate matthewjeffreyabrams.com from Railway to Cloudflare Workers (Static Assets)

## Context

The site is a single static HTML file (`site/index.html`) currently deployed on Railway via the Railpack builder, with a `Staticfile` declaring `root: site`. The domain `matthewjeffreyabrams.com` is registered with DNS on Cloudflare (nameservers `marlowe.ns.cloudflare.com` / `johnny.ns.cloudflare.com`) and currently proxied through Cloudflare in front of the Railway origin. There is no build step, no JavaScript framework, and no backend.

Cloudflare account: `zuchka studios` (id `b5a19010c0fa72255f749f63b2ec0962`).

## Goals

1. Serve the site from Cloudflare's edge instead of Railway.
2. Replace Railway's auto-deploy on push with an equivalent GitHub Actions workflow.
3. Redirect `www.matthewjeffreyabrams.com` → apex.
4. Decommission Railway cleanly with a low-risk cutover and a clear rollback path.

## Non-goals

- Fixing or adding the missing static assets the HTML references (`/apple-touch-icon.png`, `/favicon_io/favicon-32x32.png`, `/favicon-16x16.png`, `/site.webmanifest`, `/Abrams-Illuminated-Critique.pdf`). These 404 on Railway today and will continue to 404 after migration. Adding them is a separate task.
- Restructuring the HTML or fixing the malformed markup in `site/index.html` (duplicate `<html>` tag, `<h3>` inside `<head>`).
- Build pipeline, framework adoption, or any tooling beyond what's needed to deploy a static directory.

## Architecture

A single Cloudflare Worker named `mja-dot-com` on the `zuchka studios` account.

The Worker has:
- An `assets` binding pointing at `./site` — Cloudflare serves files from this directory directly from the edge.
- A small `fetch` handler in `src/worker.js` that:
  - 301-redirects requests whose hostname is `www.matthewjeffreyabrams.com` to the apex equivalent.
  - Delegates all other requests to `env.ASSETS.fetch(request)`.

Routes attached to the Worker:
- `matthewjeffreyabrams.com/*`
- `www.matthewjeffreyabrams.com/*`

Cloudflare manages DNS records automatically when custom domains are attached to the Worker.

## Files

### Added

**`wrangler.toml`** — Worker configuration.
```toml
name = "mja-dot-com"
main = "src/worker.js"
compatibility_date = "2026-05-01"

[assets]
directory = "./site"
binding = "ASSETS"

[[routes]]
pattern = "matthewjeffreyabrams.com/*"
zone_name = "matthewjeffreyabrams.com"

[[routes]]
pattern = "www.matthewjeffreyabrams.com/*"
zone_name = "matthewjeffreyabrams.com"
```

**`src/worker.js`** — minimal fetch handler.
```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.matthewjeffreyabrams.com") {
      url.hostname = "matthewjeffreyabrams.com";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
```

**`.github/workflows/deploy.yml`** — deploy on push to main.
- Triggers: `push` to `main`, `workflow_dispatch`.
- Steps: checkout → setup Node → `npx wrangler deploy`.
- Auth via repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

### Removed

- `railway.toml` — Railway-specific config, no longer needed.
- `Staticfile` — Cloud Foundry / Railway static buildpack config, no longer needed.

### Untouched

- `site/index.html` — content unchanged.

## Auth & Secrets

The user creates a Cloudflare API token via the Cloudflare dashboard:
- Template: **Edit Cloudflare Workers**
- Account resources: scoped to `zuchka studios`
- Zone resources: `matthewjeffreyabrams.com` (needed for route management)

The user adds two GitHub repository secrets to `zuchka/mja-dot-com`:
- `CLOUDFLARE_API_TOKEN` — the token above
- `CLOUDFLARE_ACCOUNT_ID` — `b5a19010c0fa72255f749f63b2ec0962`

Claude cannot create the API token or paste secrets into GitHub; the user does this manually.

## Cutover Plan

1. **Local-deploy verification.** User runs `npx wrangler login` (browser flow), then `npx wrangler deploy` from the repo. Confirms the Worker responds at `https://mja-dot-com.<account-subdomain>.workers.dev` and serves `index.html`.
2. **Attach custom domains.** The two `[[routes]]` entries in `wrangler.toml` cause Cloudflare to attach the custom domains on the next deploy. Cloudflare automatically rewrites the proxied DNS record for `matthewjeffreyabrams.com` from the Railway origin to the Worker. The `www` record is created if absent.
3. **Production verification.** `curl -I https://matthewjeffreyabrams.com` should show response headers indicating the Worker is serving (e.g., `server: cloudflare` plus a fast TTFB; the Railway origin headers should be gone). `curl -I https://www.matthewjeffreyabrams.com` should return `301` to apex.
4. **Decommission Railway.** Delete the Railway service for this project. The repo no longer auto-deploys to Railway.
5. **Cleanup commit.** Remove `railway.toml` and `Staticfile`. Push to main. GitHub Actions runs and confirms the production deploy path works end-to-end.

## Rollback

- **Before step 4 (Railway still running):** Rollback is one DNS edit. Re-point the proxied `A` record for `matthewjeffreyabrams.com` back to the Railway origin and remove the Worker's custom-domain binding. The Railway service is still live, so the site immediately serves from Railway again.
- **After step 4:** Rollback requires reinstating the Railway service from git history (`railway.toml` and `Staticfile` are recoverable from git). This is a deliberate one-way door — only proceed once step 3 has succeeded.

## Testing

This is a static site with no test suite, so verification is manual:
- After step 1: Worker URL loads `index.html` and the page renders.
- After step 2: apex domain serves the same content from the Worker, not Railway.
- After step 2: `www.` returns 301 to apex.
- After step 5: a trivial commit to `site/index.html` (e.g., whitespace) on `main` triggers GitHub Actions, deploys via wrangler, and the change is visible in production within ~1 minute.

## Risks

| Risk | Mitigation |
|---|---|
| Custom-domain attachment fails because the zone has a conflicting non-proxied DNS record | Inspect existing DNS records before deploy; remove or reconcile any conflicting `A`/`CNAME` for the apex/www. |
| API token scope is too narrow and `wrangler deploy` fails | Use the "Edit Cloudflare Workers" template, which grants the necessary Workers Scripts + Zone:Workers Routes permissions. |
| GitHub Actions runs before secrets are set | Add secrets before merging the workflow file, or use `workflow_dispatch` for the first run. |
| Missing assets (favicons, PDF) silently keep 404'ing | Out of scope. Acknowledged here so it isn't mistaken for a regression caused by the migration. |

## Open questions

None.
