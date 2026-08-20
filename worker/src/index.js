const SUPPORTED = new Set([
  "track",
  "playlist",
  "album",
  "artist",
  "episode",
  "show",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "physicsmusic-wall",
    "Content-Type": "application/json",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return json({ error: "Use POST /add or POST /remove." }, 405);
    }
    if (!env.GITHUB_TOKEN) {
      return json({ error: "Worker is missing GITHUB_TOKEN." }, 500);
    }

    const url = new URL(request.url);
    const repo = env.GITHUB_REPO || "kgary432/physicsmusic";
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Expected JSON." }, 400);
    }

    if (url.pathname === "/add" || url.pathname === "/add/") {
      const type = String(body.type || "").toLowerCase();
      const id = String(body.id || "");
      if (!SUPPORTED.has(type) || !/^[a-zA-Z0-9]+$/.test(id)) {
        return json({ error: "Invalid Spotify item." }, 400);
      }
      const response = await fetch(
        `https://api.github.com/repos/${repo}/issues`,
        {
          method: "POST",
          headers: githubHeaders(env.GITHUB_TOKEN),
          body: JSON.stringify({
            title: `embed:${type}:${id}`,
            body: `https://open.spotify.com/${type}/${id}`,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        return json(
          { error: payload.message || "GitHub rejected the add." },
          response.status
        );
      }
      return json({ ok: true, issueNumber: payload.number });
    }

    if (url.pathname === "/remove" || url.pathname === "/remove/") {
      const issueNumber = Number(body.issueNumber);
      if (!Number.isInteger(issueNumber) || issueNumber < 1) {
        return json({ error: "Invalid issue number." }, 400);
      }
      const response = await fetch(
        `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
        {
          method: "PATCH",
          headers: githubHeaders(env.GITHUB_TOKEN),
          body: JSON.stringify({ state: "closed" }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        return json(
          { error: payload.message || "GitHub rejected the remove." },
          response.status
        );
      }
      return json({ ok: true });
    }

    return json({ error: "Not found." }, 404);
  },
};
