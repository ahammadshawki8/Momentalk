"""Durable storage: the data folder, mirrored into Postgres.

Every pipeline works on plain files in settings.data_dir (photos, scene JSON, voice clips,
avatars, the cost ledger). Free hosting wipes that disk on every restart, so when DATABASE_URL
is set this module keeps a copy of the whole folder in one Postgres table:

- on boot, restore() writes every stored file back into the folder,
- while running, run_forever() uploads new or changed files and drops deleted ones every few seconds,
- on shutdown, a final sync_once() flushes the last changes.

Without DATABASE_URL (local development) it does nothing and the folder alone is the store.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading

from .config import settings

DATABASE_URL = os.environ.get("DATABASE_URL", "")
SYNC_SECONDS = float(os.environ.get("MOMENTALK_SYNC_SECONDS", "4"))
log = logging.getLogger("momentalk.persist")

SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    data BYTEA NOT NULL,
    size BIGINT NOT NULL,
    mtime DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

# What the database holds, as (size, mtime) per relative path, so each sync sends only changes.
_index: dict[str, tuple[int, float]] = {}
_lock = threading.Lock()


def enabled() -> bool:
    return bool(DATABASE_URL)


def _connect():
    import psycopg

    return psycopg.connect(DATABASE_URL, autocommit=True, connect_timeout=10)


def _scan() -> dict[str, tuple[int, float]]:
    root = settings.data_dir
    found: dict[str, tuple[int, float]] = {}
    for path in root.rglob("*"):
        if path.is_file() and not path.name.endswith(".tmp"):
            stat = path.stat()
            found[path.relative_to(root).as_posix()] = (stat.st_size, stat.st_mtime)
    return found


def restore() -> int:
    """Write every stored file into the data folder. Returns how many (0 means a fresh database)."""
    if not enabled():
        return 0
    root = settings.data_dir.resolve()
    with _connect() as conn:
        conn.execute(SCHEMA)
        rows = conn.execute("SELECT path, data, mtime FROM files").fetchall()
    for rel, data, mtime in rows:
        target = (root / rel).resolve()
        if root not in target.parents:
            continue  # never write outside the data folder
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(bytes(data))
        os.utime(target, (mtime, mtime))  # same signature as stored, so it is not uploaded again
    stored = {rel for rel, _, _ in rows}
    with _lock:
        _index.clear()
        # Files just restored match the database; anything else on disk is new and will upload.
        _index.update({rel: sig for rel, sig in _scan().items() if rel in stored})
    return len(rows)


def sync_once() -> int:
    """Upload new or changed files and delete removed ones. Returns how many paths changed."""
    if not enabled():
        return 0
    current = _scan()
    with _lock:
        previous = dict(_index)
    changed = [rel for rel, sig in current.items() if previous.get(rel) != sig]
    removed = [rel for rel in previous if rel not in current]
    if not changed and not removed:
        return 0
    root = settings.data_dir
    uploaded: list[str] = []
    with _connect() as conn, conn.transaction():
        for rel in changed:
            try:
                data = (root / rel).read_bytes()
            except FileNotFoundError:
                continue  # deleted between scan and read; the next sync sees it as removed
            size, mtime = current[rel]
            conn.execute(
                "INSERT INTO files (path, data, size, mtime) VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, size = EXCLUDED.size, "
                "mtime = EXCLUDED.mtime, updated_at = now()",
                (rel, data, size, mtime),
            )
            uploaded.append(rel)
        if removed:
            conn.execute("DELETE FROM files WHERE path = ANY(%s)", (removed,))
    with _lock:
        for rel in uploaded:
            _index[rel] = current[rel]
        for rel in removed:
            _index.pop(rel, None)
    return len(uploaded) + len(removed)


def restore_safely() -> None:
    """Boot step: restore if configured, but never stop the server from starting."""
    if not enabled():
        return
    try:
        log.warning("restored %d files from Postgres", restore())
    except Exception as exc:
        log.warning("could not restore from Postgres, starting from the bundled demo: %s", exc)


async def run_forever() -> None:
    while True:
        await asyncio.sleep(SYNC_SECONDS)
        try:
            count = await asyncio.to_thread(sync_once)
            if count:
                log.info("synced %d files to Postgres", count)
        except Exception as exc:  # keep serving even if the database blips
            log.warning("sync to Postgres failed: %s", exc)
