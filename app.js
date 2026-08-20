const GITHUB_REPO = "kgary432/physicsmusic";
const POLL_MS = 20000;
const MAX_ITEMS = 80;
const TITLE_RE =
  /^embed:(track|playlist|album|artist|episode|show):([a-zA-Z0-9]+)$/;

const form = document.getElementById("add-form");
const input = document.getElementById("spotify-url");
const addButton = form.querySelector("button[type='submit']");
const statusEl = document.getElementById("form-status");
const grid = document.getElementById("grid");
const emptyState = document.getElementById("empty-state");
const countLabel = document.getElementById("count-label");

const SUPPORTED = new Set([
  "track",
  "playlist",
  "album",
  "artist",
  "episode",
  "show",
]);

let items = [];
let pollTimer = null;

function githubToken() {
  return String(window.PHYSICS_MUSIC_GITHUB_TOKEN || "").trim();
}

function parseSpotifyLink(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const uri = trimmed.match(
    /^spotify:(track|playlist|album|artist|episode|show):([a-zA-Z0-9]+)/i
  );
  if (uri) {
    return { type: uri[1].toLowerCase(), id: uri[2] };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "open.spotify.com" && host !== "play.spotify.com") {
    return null;
  }

  const path = url.pathname.replace(/^\/intl-[a-z]{2}(?:-[a-z]{2})?\//i, "/");
  const match = path.match(
    /^\/(?:embed\/)?(track|playlist|album|artist|episode|show)\/([a-zA-Z0-9]+)/i
  );
  if (!match) return null;

  return { type: match[1].toLowerCase(), id: match[2] };
}

function embedSrc(item) {
  return `https://open.spotify.com/embed/${item.type}/${item.id}?utm_source=generator&theme=0`;
}

function itemKey(item) {
  return `${item.type}:${item.id}`;
}

function embedTitle(item) {
  return `embed:${item.type}:${item.id}`;
}

function wallSignature(list) {
  return list.map((item) => `${item.issueNumber || ""}:${itemKey(item)}`).join("|");
}

function normalize(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (
      !item ||
      !SUPPORTED.has(item.type) ||
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9]+$/.test(item.id)
    ) {
      continue;
    }
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => (b.issueNumber || 0) - (a.issueNumber || 0));
}

function setStatus(message, ok = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("ok", ok);
}

function issueFormUrl(title, body) {
  return `https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(
    title
  )}&body=${encodeURIComponent(body)}`;
}

async function githubFetch(path, options = {}) {
  const headers = {
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {}),
  };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    cache: "no-store",
    ...options,
    headers,
  });
}

function render(list) {
  const count = list.length;
  countLabel.textContent = `${count} item${count === 1 ? "" : "s"}`;
  emptyState.hidden = count !== 0;
  grid.hidden = count === 0;

  if (wallSignature(list) === wallSignature(items) && grid.childElementCount) {
    items = list;
    return;
  }

  items = list;
  grid.replaceChildren();

  list.forEach((item) => {
    const card = document.createElement("article");
    card.className = `card ${item.type}`;

    const iframe = document.createElement("iframe");
    iframe.src = embedSrc(item);
    iframe.title = `Spotify ${item.type}`;
    iframe.allow =
      "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    iframe.loading = "lazy";
    iframe.allowFullscreen = true;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.setAttribute("aria-label", `Remove this ${item.type}`);
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeItem(item, remove));

    card.append(iframe, remove);
    grid.append(card);
  });
}

async function fetchWall() {
  const response = await githubFetch("/issues?state=open&per_page=100");
  if (!response.ok) {
    throw new Error(`Could not load the wall (${response.status}).`);
  }

  const issues = await response.json();
  if (!Array.isArray(issues)) return [];

  const list = [];
  for (const issue of issues) {
    if (!issue || issue.pull_request) continue;
    const match = String(issue.title || "").match(TITLE_RE);
    if (!match) continue;
    list.push({
      type: match[1],
      id: match[2],
      issueNumber: issue.number,
    });
  }
  return normalize(list);
}

async function refreshWall({ quiet = false } = {}) {
  try {
    const next = await fetchWall();
    render(next);
    if (!quiet) setStatus("");
    return next;
  } catch (error) {
    if (!quiet) setStatus(error.message || "Could not load the shared wall.");
    return items;
  }
}

async function addItem(parsed) {
  const title = embedTitle(parsed);
  const body = `https://open.spotify.com/${parsed.type}/${parsed.id}`;

  if (githubToken()) {
    const response = await githubFetch("/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (response.ok) return "api";
  }

  window.open(issueFormUrl(title, body), "_blank", "noopener,noreferrer");
  return "form";
}

async function removeItem(item, button) {
  if (button) button.disabled = true;
  try {
    if (githubToken() && item.issueNumber) {
      const response = await githubFetch(`/issues/${item.issueNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "closed" }),
      });
      if (response.ok) {
        await refreshWall({ quiet: true });
        setStatus("Removed for everyone.", true);
        return;
      }
    }

    if (item.issueNumber) {
      window.open(
        `https://github.com/${GITHUB_REPO}/issues/${item.issueNumber}`,
        "_blank",
        "noopener,noreferrer"
      );
      setStatus("A GitHub tab opened. Close that issue to remove this for everyone.");
      return;
    }

    setStatus("Could not remove that item.");
  } catch (error) {
    setStatus(error.message || "Could not remove that item.");
  } finally {
    if (button) button.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const parsed = parseSpotifyLink(input.value);

  if (!parsed || !SUPPORTED.has(parsed.type)) {
    setStatus(
      "Use an open.spotify.com song or playlist link (track, playlist, album, or show)."
    );
    return;
  }

  addButton.disabled = true;
  try {
    const current = await fetchWall();
    if (current.some((item) => itemKey(item) === itemKey(parsed))) {
      render(current);
      setStatus("That one is already on the wall.");
      return;
    }
    if (current.length >= MAX_ITEMS) {
      render(current);
      setStatus(`The wall is full (${MAX_ITEMS} items). Remove one first.`);
      return;
    }

    const result = await addItem(parsed);
    input.value = "";
    if (result === "api") {
      await refreshWall({ quiet: true });
      setStatus("Added for everyone.", true);
    } else {
      setStatus(
        "A GitHub tab opened. Submit the issue (sign in if asked), then refresh this page."
      );
    }
  } catch (error) {
    setStatus(error.message || "Could not add that link.");
  } finally {
    addButton.disabled = false;
  }
});

function startPolling() {
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    if (document.hidden) return;
    refreshWall({ quiet: true });
  }, POLL_MS);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshWall({ quiet: true });
});

refreshWall();
startPolling();
