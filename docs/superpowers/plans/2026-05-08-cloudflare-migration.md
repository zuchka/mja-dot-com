# Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate matthewjeffreyabrams.com from Railway to a Cloudflare Worker (Static Assets) with `www → apex` redirect and GitHub Actions deploys.

**Architecture:** Single Worker named `mja-dot-com` on the `zuchka studios` Cloudflare account (id `b5a19010c0fa72255f749f63b2ec0962`). Assets-only binding pointing at `./site`, with a tiny fetch handler in `src/worker.js` that 301-redirects `www.*` to apex and otherwise delegates to `env.ASSETS.fetch(request)`. Custom Domains attach the Worker to `matthewjeffreyabrams.com` and `www.matthewjeffreyabrams.com`. Brief downtime during cutover is acceptable.

**Tech Stack:** Cloudflare Workers (Static Assets), Wrangler CLI, GitHub Actions, Node 20.

**Spec:** `docs/superpowers/specs/2026-05-08-cloudflare-migration-design.md`

**Notes for the executor:**
- Several tasks require **the user** to perform manual actions in the Cloudflare or GitHub dashboards (creating an API token, pasting GitHub secrets, deleting DNS records, deleting the Railway service). These are flagged with **USER ACTION REQUIRED** and the plan stops to wait for the user before proceeding.
- This is a static site with no test framework. "Tests" in this plan are manual `curl` verification steps. Do not invent unit tests.
- Run all commands from the repo root: `/Users/zuchka/code/mja-dot-com`.

---

## Task 1: Scaffold Worker config and source

**Files:**
- Create: `package.json`
- Create: `wrangler.toml`
- Create: `src/worker.js`
- Create: `.gitignore`

The first deploy uses the default `*.workers.dev` URL (no custom domains attached yet), so we can verify the Worker is healthy before pointing the real domain at it.

- [ ] **Step 1.1: Create `.gitignore`**

```
node_modules/
.wrangler/
.dev.vars
```

- [ ] **Step 1.2: Create `package.json`**

```json
{
  "name": "mja-dot-com",
  "private": true,
  "scripts": {
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3"
  }
}
```

- [ ] **Step 1.3: Create `wrangler.toml` (without routes — first deploy to workers.dev only)**

```toml
name = "mja-dot-com"
main = "src/worker.js"
compatibility_date = "2026-05-01"
account_id = "b5a19010c0fa72255f749f63b2ec0962"

[assets]
directory = "./site"
binding = "ASSETS"
```

- [ ] **Step 1.4: Create `src/worker.js`**

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

- [ ] **Step 1.5: Install wrangler**

Run: `npm install`
Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 1.6: Commit scaffolding**

```bash
git add .gitignore package.json package-lock.json wrangler.toml src/worker.js
git commit -m "scaffold Cloudflare Worker for static site"
```

---

## Task 2: First deploy and verify on workers.dev

**Files:** none (manual deploy + verification)

This task confirms the Worker, the assets binding, and the user's Cloudflare auth all work before we touch DNS.

- [ ] **Step 2.1: USER ACTION REQUIRED — log in to wrangler**

Tell the user to run:

```bash
npx wrangler login
```

This opens a browser window for OAuth. The user must approve. Wait for the user to confirm completion before proceeding.

- [ ] **Step 2.2: Deploy**

Run: `npx wrangler deploy`
Expected output (excerpt):
```
Total Upload: ... KiB / gzip: ... KiB
Uploaded mja-dot-com (X sec)
Deployed mja-dot-com triggers (X sec)
  https://mja-dot-com.<subdomain>.workers.dev
```

If the deploy reports "workers.dev subdomain not enabled," tell the user to enable a workers.dev subdomain in the Cloudflare dashboard (Workers & Pages → manage subdomain) and retry.

- [ ] **Step 2.3: Verify the workers.dev URL serves index.html**

Capture the workers.dev URL from the deploy output. Run:

```bash
curl -sI https://mja-dot-com.<subdomain>.workers.dev/
curl -s  https://mja-dot-com.<subdomain>.workers.dev/ | head -20
```

Expected: `HTTP/2 200`, `content-type: text/html`, and the body starts with `<!DOCTYPE html>` followed by the site content.

If the response is 404 or HTML doesn't match, stop and debug — the assets binding is misconfigured.

---

## Task 3: USER ACTION REQUIRED — clear conflicting DNS records

**Files:** none (manual Cloudflare dashboard work)

Custom Domain attachment refuses to take over an existing DNS record on the same hostname, so the apex `A` records pointing at Railway must be deleted first. This is the brief-downtime moment.

- [ ] **Step 3.1: Inventory current DNS for the zone**

Run:
```bash
dig +short A    matthewjeffreyabrams.com
dig +short A    www.matthewjeffreyabrams.com
dig +short CNAME www.matthewjeffreyabrams.com
```

Record the output so the user can sanity-check what they're deleting.

- [ ] **Step 3.2: USER ACTION REQUIRED — delete records in the Cloudflare dashboard**

Tell the user:

> Open https://dash.cloudflare.com → matthewjeffreyabrams.com zone → DNS → Records.
>
> 1. Delete every `A` record for `@` (apex) — these point at Railway.
> 2. If a `CNAME` or `A` record exists for `www`, delete it too.
> 3. Do NOT delete `MX`, `TXT`, `NS`, or any other record types.
>
> The site will be unreachable on the custom domain until Task 4 completes — this is expected.

Wait for the user to confirm deletion before continuing.

---

## Task 4: Add Custom Domains and redeploy

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 4.1: Add `routes` block to `wrangler.toml`**

After the `[assets]` block, append:

```toml
routes = [
  { pattern = "matthewjeffreyabrams.com", custom_domain = true },
  { pattern = "www.matthewjeffreyabrams.com", custom_domain = true },
]
```

The full file should now read:

```toml
name = "mja-dot-com"
main = "src/worker.js"
compatibility_date = "2026-05-01"
account_id = "b5a19010c0fa72255f749f63b2ec0962"

[assets]
directory = "./site"
binding = "ASSETS"

routes = [
  { pattern = "matthewjeffreyabrams.com", custom_domain = true },
  { pattern = "www.matthewjeffreyabrams.com", custom_domain = true },
]
```

- [ ] **Step 4.2: Deploy with custom domains**

Run: `npx wrangler deploy`
Expected output (excerpt):
```
Uploaded mja-dot-com (X sec)
Deployed mja-dot-com triggers (X sec)
  https://matthewjeffreyabrams.com (custom domain)
  https://www.matthewjeffreyabrams.com (custom domain)
  https://mja-dot-com.<subdomain>.workers.dev
```

If wrangler reports a DNS conflict, return to Task 3 and verify the conflicting record was actually deleted (sometimes a stale row hides under a filter in the dashboard).

- [ ] **Step 4.3: Verify apex serves the Worker**

Run:
```bash
curl -sI https://matthewjeffreyabrams.com/
```

Expected: `HTTP/2 200`, `content-type: text/html`, `server: cloudflare`. Cloudflare may take ~30 seconds to issue the edge cert; if you see TLS errors, wait and retry.

Then:
```bash
curl -s https://matthewjeffreyabrams.com/ | head -20
```

Expected: starts with `<!DOCTYPE html>` and matches the content of `site/index.html`.

- [ ] **Step 4.4: Verify www redirects to apex**

Run:
```bash
curl -sI https://www.matthewjeffreyabrams.com/
```

Expected: `HTTP/2 301`, `location: https://matthewjeffreyabrams.com/`.

- [ ] **Step 4.5: Commit the routes change**

```bash
git add wrangler.toml
git commit -m "attach Worker to apex and www custom domains"
```

---

## Task 5: USER ACTION REQUIRED — provision GitHub deploy credentials

**Files:** none (manual Cloudflare + GitHub dashboard work)

These two secrets allow GitHub Actions to deploy without human interaction.

- [ ] **Step 5.1: USER ACTION REQUIRED — create a Cloudflare API token**

Tell the user:

> 1. Open https://dash.cloudflare.com/profile/api-tokens → **Create Token**.
> 2. Use the **Edit Cloudflare Workers** template.
> 3. Account Resources: include `zuchka studios`.
> 4. Zone Resources: include `matthewjeffreyabrams.com`.
> 5. Click **Continue to summary** → **Create Token**.
> 6. Copy the token value (shown once — you cannot retrieve it later).

Wait for the user to confirm they have the token before proceeding.

- [ ] **Step 5.2: USER ACTION REQUIRED — add GitHub repository secrets**

Tell the user:

> 1. Open https://github.com/zuchka/mja-dot-com/settings/secrets/actions → **New repository secret**.
> 2. Add `CLOUDFLARE_API_TOKEN` = (the token from Step 5.1).
> 3. Add `CLOUDFLARE_ACCOUNT_ID` = `b5a19010c0fa72255f749f63b2ec0962`.

Wait for the user to confirm both secrets are saved before proceeding.

---

## Task 6: Add GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 6.1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]
    paths:
      - 'site/**'
      - 'src/**'
      - 'wrangler.toml'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Deploy to Cloudflare Workers
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- [ ] **Step 6.2: Commit the workflow**

```bash
git add .github/workflows/deploy.yml
git commit -m "add GitHub Actions workflow for Cloudflare deploys"
```

- [ ] **Step 6.3: Push to main and verify the workflow runs**

```bash
git push origin main
```

Then check the Actions tab in GitHub (`https://github.com/zuchka/mja-dot-com/actions`). The "Deploy to Cloudflare" workflow should run and finish green within ~1 minute.

If it fails:
- `Authentication error` → secrets are misnamed or the token is wrong; revisit Task 5.
- `Required input not provided` → the workflow YAML has a typo; re-check Step 6.1.

---

## Task 7: USER ACTION REQUIRED — decommission Railway

**Files:** none (manual Railway dashboard work)

- [ ] **Step 7.1: USER ACTION REQUIRED — delete the Railway service**

Tell the user:

> 1. Open https://railway.app → the project hosting matthewjeffreyabrams.com.
> 2. Delete the service (or the entire project if it only contains this site).

The site is already serving from Cloudflare, so deleting Railway has no user-facing effect. Wait for the user to confirm deletion before proceeding.

---

## Task 8: Remove Railway-specific config

**Files:**
- Delete: `railway.toml`
- Delete: `Staticfile`

This proves the GitHub Actions deploy path is end-to-end functional by triggering it with a real change.

- [ ] **Step 8.1: Delete the Railway config files**

```bash
git rm railway.toml Staticfile
```

- [ ] **Step 8.2: Commit and push**

```bash
git commit -m "remove Railway config after Cloudflare migration"
git push origin main
```

- [ ] **Step 8.3: Verify the GitHub Actions workflow ran**

Note: this commit doesn't change paths under `site/`, `src/`, or `wrangler.toml`, so the path filters in `.github/workflows/deploy.yml` mean the workflow will NOT auto-trigger for it. That's fine — there's nothing to deploy. To prove the deploy path works end-to-end, do the next step.

- [ ] **Step 8.4: End-to-end deploy verification**

Make a trivial whitespace edit to `site/index.html` (e.g., add a blank line at the bottom).

```bash
git add site/index.html
git commit -m "test: trigger end-to-end deploy"
git push origin main
```

Watch `https://github.com/zuchka/mja-dot-com/actions`. The "Deploy to Cloudflare" workflow should run green within ~1 minute. After it succeeds:

```bash
curl -sI https://matthewjeffreyabrams.com/
```

Expected: still `HTTP/2 200`, served by Cloudflare. Migration complete.

---

## Self-Review Checklist (executor: do not skip)

After Task 8 completes, confirm:

- [ ] `https://matthewjeffreyabrams.com/` returns 200 with the site HTML.
- [ ] `https://www.matthewjeffreyabrams.com/` returns 301 to apex.
- [ ] A push to `main` that touches `site/` deploys automatically via GitHub Actions.
- [ ] Railway service is deleted (no further charges).
- [ ] `railway.toml` and `Staticfile` are gone from the repo.
- [ ] `git log` shows clean, atomic commits per task.
