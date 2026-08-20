#!/usr/bin/env python3
"""Sync the shared listening wall into wall.json."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

WALL_FILE = "wall.json"
SUPPORTED = {"track", "playlist", "album", "artist", "episode", "show"}
TITLE_RE = re.compile(
    r"^(embed|remove):(track|playlist|album|artist|episode|show):([a-zA-Z0-9]+)$"
)


def load_wall() -> dict:
    with open(WALL_FILE, encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        return {"endpoint": "", "items": []}
    return data


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
        extra_id = item.get("_id")
        if isinstance(extra_id, str) and extra_id:
            record["_id"] = extra_id
        key = item_key(record)
        if key in seen:
            continue
        seen.add(key)
        out.append(record)
    return out


def fetch_json(url: str, data: bytes | None = None, method: str = "GET") -> object | None:
    headers = {"User-Agent": "physicsmusic-wall", "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8")
            if not body:
                return None
            return json.loads(body)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


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


def post_live(endpoint: str, item: dict) -> None:
    fetch_json(endpoint, data=json.dumps({"type": item["type"], "id": item["id"]}).encode("utf-8"), method="POST")


def delete_live(endpoint: str, item: dict) -> None:
    live = fetch_json(endpoint)
    if not isinstance(live, list):
        return
    for row in live:
        if (
            isinstance(row, dict)
            and row.get("type") == item["type"]
            and row.get("id") == item["id"]
            and row.get("_id")
        ):
            fetch_json(f"{endpoint}/{row['_id']}", method="DELETE")
            return


def main() -> None:
    wall = load_wall()
    endpoint = wall.get("endpoint") if isinstance(wall.get("endpoint"), str) else ""
    items = normalize_items(wall.get("items"))
    mode = os.environ.get("MODE", "backup")

    if mode == "backup" and endpoint:
        live = fetch_json(endpoint)
        if isinstance(live, list):
            items = normalize_items(live)

    if mode == "issue":
        match = TITLE_RE.match(os.environ.get("ISSUE_TITLE", "").strip())
        if match:
            action, kind, ident = match.group(1), match.group(2), match.group(3)
            record = {"type": kind, "id": ident}
            if action == "embed":
                if item_key(record) not in {item_key(item) for item in items}:
                    items.insert(0, record)
                if endpoint:
                    post_live(endpoint, record)
            else:
                items = [item for item in items if item_key(item) != item_key(record)]
                if endpoint:
                    delete_live(endpoint, record)
        close_issue(os.environ.get("ISSUE_NUMBER", ""))

    wall["endpoint"] = endpoint
    wall["items"] = items
    save_wall(wall)


if __name__ == "__main__":
    main()
