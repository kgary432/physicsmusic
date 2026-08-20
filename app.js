const GITHUB_REPO = "kgary432/physicsmusic";
const WALL_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/wall.json`;
const POLL_MS = 20000;
const MAX_ITEMS = 80;

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
let liveEndpoint = "";
let pollTimer = null;

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

function wallSignature(list) {
  return list.map((item) => `${item._id || ""}:${itemKey(item)}`).join("|");
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
  return out.sort((a, b) =>
    String(b._id || itemKey(b)).localeCompare(String(a._id || itemKey(a)))
  );
}

function setStatus(message, ok = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("ok", ok);
}

function issueUrl(kind, parsed) {
  const title = `${kind}:${parsed.type}:${parsed.id}`;
  const body = `https://open.spotify.com/${parsed.type}/${parsed.id}`;
  return `https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(
    title
  )}&body=${encodeURIComponent(body)}`;
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

async function fetchGitHubWall() {
  const request = await fetch(`${WALL_API_URL}?ref=main&_=${Date.now()}`, {
    cache: "no-store",
  });
  if (request.ok) {
    const payload = await request.json();
    const decoded = JSON.parse(
      atob(String(payload.content || "").replace(/\n/g, ""))
    );
    if (decoded && typeof decoded === "object") return decoded;
  }

  const local = await fetch(`wall.json?_=${Date.now()}`, { cache: "no-store" });
  if (!local.ok) {
    throw new Error("Could not load the wall.");
  }
  return local.json();
}

async function fetchLiveWall(endpoint) {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load the wall (${response.status}).`);
  }
  return normalize(await response.json());
}

async function fetchWall() {
  const meta = await fetchGitHubWall();
  if (typeof meta.endpoint === "string" && meta.endpoint) {
    liveEndpoint = meta.endpoint;
  }
  const saved = normalize(meta.items);

  if (!liveEndpoint) return saved;

  try {
    return await fetchLiveWall(liveEndpoint);
  } catch {
    return saved;
  }
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
  if (liveEndpoint) {
    const response = await fetch(liveEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: parsed.type, id: parsed.id }),
    });
    if (response.ok) return "live";
  }

  window.open(issueUrl("embed", parsed), "_blank", "noopener,noreferrer");
  return "issue";
}

async function removeItem(item, button) {
  if (button) button.disabled = true;
  try {
    if (liveEndpoint && item._id) {
      const response = await fetch(`${liveEndpoint}/${item._id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await refreshWall({ quiet: true });
        setStatus("Removed for everyone.", true);
        return;
      }
    }

    window.open(issueUrl("remove", item), "_blank", "noopener,noreferrer");
    setStatus(
      "A GitHub tab opened. Submit that issue to remove this for everyone."
    );
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
    if (result === "live") {
      await refreshWall({ quiet: true });
      setStatus("Added for everyone.", true);
    } else {
      setStatus(
        "A GitHub tab opened. Submit the issue, then this page will pick it up."
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
