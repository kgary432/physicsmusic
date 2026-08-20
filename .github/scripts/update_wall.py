#!/usr/bin/env python3
"""Mirror listening-wall GitHub issues into wall.json."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

WALL_FILE = "wall.json"
SUPPORTED = {"track", "playlist", "album", "artist", "episode", "show"}
EMBED_RE = re.compile(
    r"^embed:(track|playlist|album|artist|episode|show):([a-zA-Z0-9]+)$"
)
REMOVE_RE = re.compile(
    r"^remove:(track|playlist|album|artist|episode|show):([a-zA-Z0-9]+)$"
)


def load_wall() -> dict:
    try:
        with open(WALL_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {"items": []}


def save_wall(data: dict) -> None:
    with open(WALL_FILE, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def item_key(item: dict) -> str:
    return f"{item['type']}:{item['id']}"


def normalize_items(items) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    if not isinstance(items, list):
        return out
    for item in items:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        ident = item.get("id")
        if kind not in SUPPORTED or not isinstance(ident, str):
            continue
        if not re.fullmatch(r"[a-zA-Z0-9]+", ident):
            continue
        record = {"type": kind, "id": ident}
        if isinstance(item.get("issueNumber"), int):
            record["issueNumber"] = item["issueNumber"]
        key = item_key(record)
        if key in seen:
            continue
        seen.add(key)
        out.append(record)
    return out


def close_issue(number: str) -> None:
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo or not number:
        return
    payload = json.dumps({"state": "closed"}).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/issues/{number}",
        data=payload,
        method="PATCH",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "physicsmusic-wall",
        },
    )
    try:
        urllib.request.urlopen(request, timeout=20).read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return


def main() -> None:
    wall = load_wall()
    items = normalize_items(wall.get("items"))
    title = os.environ.get("ISSUE_TITLE", "").strip()
    issue_action = os.environ.get("ISSUE_ACTION", "opened")
    number_raw = os.environ.get("ISSUE_NUMBER", "").strip()
    try:
        number = int(number_raw) if number_raw else None
    except ValueError:
        number = None

    embed = EMBED_RE.match(title)
    remove = REMOVE_RE.match(title)

    if embed:
        record = {"type": embed.group(1), "id": embed.group(2)}
        if number is not None:
            record["issueNumber"] = number
        if issue_action == "opened":
            if item_key(record) not in {item_key(item) for item in items}:
                items.insert(0, record)
        elif issue_action == "closed":
            items = [item for item in items if item_key(item) != item_key(record)]
    elif remove and issue_action == "opened":
        record = {"type": remove.group(1), "id": remove.group(2)}
        items = [item for item in items if item_key(item) != item_key(record)]
        close_issue(number_raw)

    wall["items"] = items
    save_wall(wall)


if __name__ == "__main__":
    main()
