const WALL_API =
  "https://crudcrud.com/api/b3a25c6b01154d49b2c9318765cceef9/embeds";
const POLL_MS = 15000;
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
  return list.map((item) => `${item._id}:${itemKey(item)}`).join("|");
}

function normalize(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (item) =>
        item &&
        SUPPORTED.has(item.type) &&
        typeof item.id === "string" &&
        /^[a-zA-Z0-9]+$/.test(item.id)
    )
    .sort((a, b) => String(b._id || "").localeCompare(String(a._id || "")));
}

function setStatus(message, ok = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("ok", ok);
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
  const response = await fetch(WALL_API, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load the wall (${response.status}).`);
  }
  return normalize(await response.json());
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
  const response = await fetch(WALL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: parsed.type, id: parsed.id }),
  });
  if (!response.ok) {
    throw new Error(`Could not add that link (${response.status}).`);
  }
}

async function removeItem(item, button) {
  if (!item._id) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${WALL_API}/${item._id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Could not remove that item (${response.status}).`);
    }
    await refreshWall({ quiet: true });
    setStatus("Removed for everyone.", true);
  } catch (error) {
    if (button) button.disabled = false;
    setStatus(error.message || "Could not remove that item.");
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

    await addItem(parsed);
    input.value = "";
    await refreshWall({ quiet: true });
    setStatus("Added for everyone.", true);
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
