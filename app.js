const STORAGE_KEY = "physicsmusic-embeds";

const form = document.getElementById("add-form");
const input = document.getElementById("spotify-url");
const statusEl = document.getElementById("form-status");
const grid = document.getElementById("grid");
const emptyState = document.getElementById("empty-state");
const countLabel = document.getElementById("count-label");
const clearAll = document.getElementById("clear-all");

const SUPPORTED = new Set([
  "track",
  "playlist",
  "album",
  "artist",
  "episode",
  "show",
]);

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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

function setStatus(message, ok = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("ok", ok);
}

function render(items) {
  const count = items.length;
  countLabel.textContent = `${count} item${count === 1 ? "" : "s"}`;
  clearAll.hidden = count === 0;
  emptyState.hidden = count !== 0;
  grid.hidden = count === 0;
  grid.replaceChildren();

  items.forEach((item, index) => {
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
    remove.setAttribute("aria-label", `Remove ${item.type}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const next = loadItems().filter((_, i) => i !== index);
      saveItems(next);
      render(next);
    });

    card.append(iframe, remove);
    grid.append(card);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const parsed = parseSpotifyLink(input.value);

  if (!parsed || !SUPPORTED.has(parsed.type)) {
    setStatus(
      "Use an open.spotify.com song or playlist link (track, playlist, album, or show)."
    );
    return;
  }

  const items = loadItems();
  const already = items.some(
    (item) => item.type === parsed.type && item.id === parsed.id
  );
  if (already) {
    setStatus("That one is already on the wall.");
    return;
  }

  items.unshift(parsed);
  saveItems(items);
  render(items);
  input.value = "";
  setStatus("Added.", true);
});

clearAll.addEventListener("click", () => {
  if (!window.confirm("Remove every embed from this browser?")) return;
  saveItems([]);
  render([]);
  setStatus("");
});

render(loadItems());
