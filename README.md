# Mushin

> _無心 (mushin)_ — "no mind"; acting without hesitation.

Mushin is a **GitHub App** implemented as a **Cloudflare Worker** that automatically merges Dependabot pull requests when configurable conditions are met.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [GitHub App Setup](#github-app-setup)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Behavior](#behavior)
- [Development](#development)
- [License](#license)

---

## Overview

Mushin listens for GitHub webhook events and automatically merges Dependabot PRs based on configurable rules. It supports:

- **Semver-level gating** — only auto-merge patch, minor, or major updates.
- **Multi-source configuration** — GitHub custom properties (org/repo level), `.github/mushin.yml`, and PR labels, with label overrides taking highest precedence.
- **CI gate** — only merges when all required checks pass; neutral check-run conclusions are treated as non-blocking.
- **Unknown update type handling** — posts an informative PR comment with upsert logic (no duplicate comments) when Dependabot metadata cannot be parsed.

---

## How It Works

1. GitHub sends a webhook (`pull_request`, `check_suite`, or `check_run`) to the Mushin Worker endpoint.
2. Mushin validates the HMAC-SHA256 signature using the configured webhook secret.
3. For Dependabot PRs, Mushin:
   - Resolves configuration from custom properties → `.github/mushin.yml` → PR labels.
   - Checks that all CI checks are passing.
   - Parses the Dependabot commit message to determine the semver update type.
   - Merges the PR if the update type is within the configured limit.
   - Comments on the PR if the update type cannot be determined (with upsert to avoid duplicates).

---

## GitHub App Setup

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Set the **Webhook URL** to your Cloudflare Worker URL (e.g. `https://mushin.<your-subdomain>.workers.dev/webhook`).
3. Set a **Webhook secret** (save it — you'll need it as `GITHUB_WEBHOOK_SECRET`).
4. Configure the permissions and events below.
5. After creation, note the **App ID** and generate a **private key**.

### Required Permissions

| Permission        | Access       | Reason                                                  |
|-------------------|--------------|---------------------------------------------------------|
| Pull requests     | Read & Write | Read PR data, merge PRs, comment                        |
| Contents          | Read & Write | Read `.github/mushin.yml` and perform the merge commit  |
| Checks            | Read         | Verify CI checks before merging                         |
| Commit statuses   | Read         | Verify commit status before merging                     |
| Metadata          | Read         | Required for all GitHub Apps                            |

### Required Webhook Events

| Event          | Reason                                                |
|----------------|-------------------------------------------------------|
| `pull_request` | Triggered when a PR is opened, reopened, or updated  |
| `check_suite`  | Triggered when a suite of CI checks completes        |
| `check_run`    | Triggered when an individual CI check completes      |

---

## Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- A Cloudflare account

### Cloudflare Worker Secrets

Set the following secrets using Wrangler (each command will prompt for the value interactively):

```bash
wrangler secret put GITHUB_APP_ID
# → Enter the numeric App ID when prompted, e.g.: 123456

wrangler secret put GITHUB_WEBHOOK_SECRET
# → Paste the webhook secret when prompted

wrangler secret put GITHUB_PRIVATE_KEY
# → Paste the full PKCS#8 PEM (including header/footer lines) when prompted
```

Or supply values non-interactively via stdin:

```bash
echo '123456' | wrangler secret put GITHUB_APP_ID
echo 'my-webhook-secret' | wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put GITHUB_PRIVATE_KEY < private-key-pkcs8.pem
```

| Secret                  | Description                                                |
|-------------------------|------------------------------------------------------------|
| `GITHUB_APP_ID`         | The numeric GitHub App ID shown on your App settings page  |
| `GITHUB_WEBHOOK_SECRET` | The webhook secret configured in your GitHub App           |
| `GITHUB_PRIVATE_KEY`    | The PKCS#8 PEM private key (see conversion below)          |

### Private Key Conversion

GitHub provides private keys in **PKCS#1** format. The Web Crypto API (used in Cloudflare Workers) requires **PKCS#8**. Convert with:

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM \
  -in private-key.pem \
  -out private-key-pkcs8.pem \
  -nocrypt
```

Then set the secret:

```bash
# On Linux/macOS — preserves newlines
wrangler secret put GITHUB_PRIVATE_KEY < private-key-pkcs8.pem
```

### Deploy

```bash
npm install
npm run deploy
```

After deployment, configure the Webhook URL in your GitHub App settings to point to:
`https://mushin.<your-subdomain>.workers.dev/webhook`

---

## Configuration

Mushin supports three configuration sources, applied with the following precedence (highest to lowest):

1. **PR labels** — highest precedence, per-PR overrides
2. **`.github/mushin.yml`** — repo-level configuration
3. **GitHub custom properties** — org/repo-level defaults

### GitHub Custom Properties

Configure at the organization or repository level via **Settings → Custom properties**.

| Property Name                       | Allowed Values              | Default  | Description                                     |
|-------------------------------------|-----------------------------|----------|-------------------------------------------------|
| `mushin_highest_version_to_merge`   | `patch`, `minor`, `major`   | `minor`  | Highest semver update level to auto-merge       |
| `mushin_merge_unknown`              | `true`, `false`             | `false`  | Merge PRs when the update type cannot be parsed |
| `mushin_merge_method`               | `merge`, `squash`, `rebase` | `squash` | Git merge method to use                         |
| `mushin_skip`                       | `true`, `false`             | `false`  | Skip all Dependabot PRs in this repo            |

### Repo Config File (`.github/mushin.yml`)

Create `.github/mushin.yml` in your repository to configure Mushin at the repo level.

```yaml
# .github/mushin.yml

# Highest semver level to auto-merge: patch | minor | major
# Default: minor
highest_version_to_merge: minor

# Merge PRs when the update type cannot be determined by parsing Dependabot metadata.
# Default: false
merge_unknown: false

# Git merge method: merge | squash | rebase
# Default: squash
merge_method: squash

# Set to true to disable Mushin for this repository entirely.
# Default: false
skip: false
```

### PR Label Overrides

Add labels directly to a Dependabot PR to override configuration on a per-PR basis.

| Label                  | Effect                                                               |
|------------------------|----------------------------------------------------------------------|
| `mushin:skip`          | Mushin will not attempt to merge this PR                            |
| `mushin:merge-unknown` | Merge even if the semver update type cannot be determined           |
| `mushin:merge-major`   | Allow major updates for this PR (overrides `highest_version_to_merge`) |
| `mushin:merge-minor`   | Allow up to minor updates for this PR                               |
| `mushin:merge-patch`   | Allow only patch updates for this PR                                |

### Precedence

```
PR labels  >  .github/mushin.yml  >  GitHub custom properties  >  built-in defaults
```

---

## Behavior

### When Mushin merges a PR

Mushin will merge a Dependabot PR when **all** of the following are true:

1. The PR is open and not a draft.
2. The PR author is `dependabot[bot]`.
3. The `skip` configuration is `false`.
4. All CI checks are complete with no failing conclusions, and any legacy commit statuses are not pending or failing. Neutral check-run conclusions are allowed.
5. The semver update type (patch / minor / major) is within the configured `highest_version_to_merge` limit, **or** `merge_unknown` is `true` when the type is unknown.

### When Mushin skips a PR

- `skip: true` is configured (via custom property, YAML, or `mushin:skip` label).
- The PR is a draft.
- The PR author is not `dependabot[bot]`.
- CI checks have not yet passed or have failed.
- The update type exceeds `highest_version_to_merge` (e.g. a major update when limit is `minor`).

### Comment behavior

When Mushin cannot determine the semver update type **and** `merge_unknown` is `false`, it posts a comment on the PR explaining:

- Why it did not merge.
- How to resolve the issue (wait, label override, config override, or skip).

Mushin uses **upsert logic** for comments:
- If no Mushin comment exists on the PR, it creates one.
- If a comment already exists with the same content (checked via FNV-1a hash), it is **not** updated (avoiding unnecessary notifications).
- If the content has changed, the existing comment is updated in place.

---

## Development

### Commands

```bash
# Install dependencies
npm install

# Type-check without emitting files
npm run typecheck

# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run the worker locally (requires wrangler login)
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

### Dependabot metadata parser

Mushin imports [`parse()`](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/update_metadata.ts)
directly from the [`dependabot/fetch-metadata`](https://github.com/dependabot/fetch-metadata) repository (installed via
`"fetch-metadata": "github:dependabot/fetch-metadata"`), rather than vendoring a copy. This ensures the parser stays
up to date and can be kept current by Dependabot itself.

> [!Important] 
> `npm audit` **false positive**  
>
> `npm audit` may report a critical advisory
> ([GHSA-qg3v-mcf9-qc3m](https://github.com/advisories/GHSA-qg3v-mcf9-qc3m)) for a package named
> `dependabot-pull-request-action`. This advisory refers to a malicious package that was published under that name on
> the public npm registry. The package installed here comes directly from the
> [`dependabot/fetch-metadata`](https://github.com/dependabot/fetch-metadata) GitHub repository — not from the npm
> registry — so the advisory does not apply. The `dependabot/fetch-metadata` project uses the same package name in its
> `package.json` (as a GitHub Action convention), which triggers the false positive.

---

## License

[MIT](LICENSE)
