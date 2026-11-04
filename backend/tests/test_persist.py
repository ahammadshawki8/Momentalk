"""Postgres mirror round trip. Runs only when MOMENTALK_TEST_DATABASE_URL points at a scratch database."""

import os
from types import SimpleNamespace

import pytest

from app import persist

URL = os.environ.get("MOMENTALK_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="set MOMENTALK_TEST_DATABASE_URL to run")


def _use(monkeypatch, folder):
    monkeypatch.setattr(persist, "DATABASE_URL", URL)
    monkeypatch.setattr(persist, "settings", SimpleNamespace(data_dir=folder))
    persist._index.clear()


def test_files_survive_a_wiped_disk(tmp_path, monkeypatch):
    disk = tmp_path / "disk"
    (disk / "scenes" / "s_1").mkdir(parents=True)
    (disk / "scenes" / "s_1" / "scene.json").write_text('{"id": "s_1"}')
    (disk / "scenes" / "s_1" / "photo.jpg").write_bytes(b"\xff\xd8jpeg")
    (disk / "cost_ledger.json").write_text('{"total_usd": 1.25}')
    _use(monkeypatch, disk)
    with persist._connect() as conn:
        conn.execute(persist.SCHEMA)
        conn.execute("DELETE FROM files")

    assert persist.sync_once() == 3
    assert persist.sync_once() == 0  # nothing changed, nothing sent

    (disk / "scenes" / "s_1" / "photo.jpg").unlink()
    (disk / "cost_ledger.json").write_text('{"total_usd": 2.5}')
    assert persist.sync_once() == 2  # one delete, one update

    fresh = tmp_path / "fresh"  # a new container: empty disk
    fresh.mkdir()
    _use(monkeypatch, fresh)
    assert persist.restore() == 2
    assert (fresh / "scenes" / "s_1" / "scene.json").read_text() == '{"id": "s_1"}'
    assert (fresh / "cost_ledger.json").read_text() == '{"total_usd": 2.5}'
    assert not (fresh / "scenes" / "s_1" / "photo.jpg").exists()
    assert persist.sync_once() == 0  # restored files are already in the database
