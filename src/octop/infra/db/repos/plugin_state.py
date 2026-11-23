"""Opaque, scoped plugin documents in the existing settings KV table.

CAS covers concurrent HTTP/tool/scheduler writers, including separate processes.
The domain owns document schemas; this repository only performs SQL.
"""

from __future__ import annotations

from octop.infra.db.pool import DatabasePool


class _VersionConflict(Exception):
    pass


class PluginStateRepo:
    def __init__(self, db: DatabasePool) -> None:
        self._db = db

    def get(self, key: str) -> str | None:
        with self._db.connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return str(row["value"]) if row else None

    def compare_and_set(self, key: str, old: str | None, new: str) -> bool:
        return self.compare_and_set_many([(key, old, new)])

    def compare_and_set_many(self, changes: list[tuple[str, str | None, str]]) -> bool:
        """Commit related documents together, rolling back every write on conflict."""
        try:
            with self._db.transaction() as conn:
                for key, old, new in changes:
                    if old is None:
                        result = conn.execute(
                            "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
                            (key, new),
                        )
                    else:
                        result = conn.execute(
                            "UPDATE settings SET value = ? WHERE key = ? AND value = ?",
                            (new, key, old),
                        )
                    if result.rowcount != 1:
                        raise _VersionConflict
        except _VersionConflict:
            return False
        return True
