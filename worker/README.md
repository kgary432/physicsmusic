# Perpetual adds (Cloudflare Worker)

The listening wall is stored in GitHub Issues, which do not expire. This worker holds a GitHub token as a secret so visitors can add and remove songs without putting that token on GitHub Pages.

## 1. GitHub token

1. Open [Fine-grained tokens](https://github.com/settings/personal-access-tokens).
2. Generate a token named `physicsmusic-wall`.
3. Repository access: only `physicsmusic`.
4. Permissions: **Issues: Read and write**.
5. Copy the token. Do not commit it.

## 2. Let Actions write `wall.json`

1. Open [Action settings](https://github.com/kgary432/physicsmusic/settings/actions).
2. Workflow permissions: **Read and write permissions**.
3. Save.

## 3. Deploy the worker

```bash
cd worker
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

Paste the GitHub token when `secret put` asks. Deploy prints a URL like `https://physicsmusic-wall.<account>.workers.dev`.

## 4. Point the site at the worker

In `config.js`:

```js
window.PHYSICS_MUSIC_WORKER_URL = "https://physicsmusic-wall.<account>.workers.dev";
```

Commit and push that URL (it is not a secret).

## Paid vs free

Cloudflare Workers **free** is enough for this wall (100,000 requests/day). Upgrade to **Workers Paid ($5/month)** only if you outgrow the free cap. You do not need a paid CrudCrud plan.
