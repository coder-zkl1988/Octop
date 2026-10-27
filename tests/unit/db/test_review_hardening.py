"""Regression tests for DB-layer fixes from the security / robustness review."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from octop.infra.db.migrate import (
    _sqlite_executescript_atomic,
    _sqlite_foreign_keys_off,
    run_migrations,
)
from octop.infra.db.pool import SqlitePool
from octop.infra.db.repos.agents import AgentRepo
from octop.infra.db.repos.resource_group_grants import ResourceGroupGrantRepo


@pytest.fixture
def pool(tmp_path: Path) -> SqlitePool:
    db = SqlitePool(tmp_path / "octop.db")
    run_migrations(db)
    return db


def _seed_users(db: SqlitePool) -> tuple[int, int]:
    with db.transaction() as conn:
        for name in ("owner", "viewer"):
            conn.execute(
                "INSERT INTO users(username, password_hash, role, created_at)"
                " VALUES (?, 'x', 'user', 0)",
                (name,),
            )
        owner = conn.execute("SELECT id FROM users WHERE username = 'owner'").fetchone()[0]
        viewer = conn.execute("SELECT id FROM users WHERE username = 'viewer'").fetchone()[0]
    return int(owner), int(viewer)


def test_list_shared_does_not_leak_unshared_group_granted_agents(pool: SqlitePool) -> None:
    owner, viewer = _seed_users(pool)
    with pool.transaction() as conn:
        conn.execute(
            "INSERT INTO agents(agent_id, user_id, name, enabled, is_shared, created_at,"
            " updated_at) VALUES ('ag_private', ?, 'P', 0, 0, 0, 0)",
            (owner,),
        )
        conn.execute(
            "INSERT INTO agents(agent_id, user_id, name, enabled, is_shared, created_at,"
            " updated_at) VALUES ('ag_shared', ?, 'S', 1, 1, 0, 0)",
            (owner,),
        )
        conn.execute(
            "INSERT INTO user_group(user_group_id, name, created_at, updated_at)"
            " VALUES ('g1', 'G', 0, 0)"
        )
        conn.execute(
            "INSERT INTO user_group_member(user_group_id, user_id, created_at) VALUES ('g1', ?, 0)",
            (viewer,),
        )
        for key in ("ag_private", "ag_shared"):
            conn.execute(
                "INSERT INTO resource_group_grant(resource_type, resource_key, user_group_id)"
                " VALUES ('expert', ?, 'g1')",
                (key,),
            )
    ids = [row.agent_id for row in AgentRepo(pool).list_shared(viewer_user_id=viewer)]
    assert ids == ["ag_shared"]
    # exclude_user_id must still apply when the viewer belongs to a granted group.
    assert AgentRepo(pool).list_shared(exclude_user_id=owner, viewer_user_id=viewer) == []


def test_delete_prefix_treats_underscore_and_case_literally(pool: SqlitePool) -> None:
    with pool.transaction() as conn:
        conn.execute(
            "INSERT INTO user_group(user_group_id, name, created_at, updated_at)"
            " VALUES ('g1', 'G', 0, 0)"
        )
    repo = ResourceGroupGrantRepo(pool)
    for key in ("my_llm", "my_llm/gpt", "my-llm/gpt", "MY_LLM/gpt", "my_llmx/gpt"):
        repo.replace("model", key, ["g1"])
    repo.delete_prefix("model", "my_llm")
    remaining = sorted(key for _gid, _type, key in repo.list_all())
    assert remaining == ["MY_LLM/gpt", "my-llm/gpt", "my_llmx/gpt"]


def test_executescript_atomic_rolls_back_partial_ddl(pool: SqlitePool) -> None:
    with pool.transaction() as conn:
        conn.execute("CREATE TABLE widgets (id INTEGER PRIMARY KEY)")
    script = """
        ALTER TABLE widgets RENAME TO widgets_legacy;
        CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        INSERT INTO no_such_table VALUES (1);
    """
    with pytest.raises(sqlite3.OperationalError):
        _sqlite_executescript_atomic(pool, script)
    with pool.connect() as conn:
        tables = {
            row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        assert "widgets" in tables
        assert "widgets_legacy" not in tables
        assert not conn.in_transaction
    # The pool is still usable afterwards.
    with pool.transaction() as conn:
        conn.execute("INSERT INTO widgets(id) VALUES (1)")


def test_executescript_atomic_lifts_foreign_key_pragma(pool: SqlitePool) -> None:
    """``PRAGMA foreign_keys = OFF`` inside the script must still take effect."""
    with pool.transaction() as conn:
        conn.execute("CREATE TABLE parent (id INTEGER PRIMARY KEY)")
        conn.execute(
            "CREATE TABLE child (id INTEGER PRIMARY KEY,"
            " parent_id INTEGER REFERENCES parent(id) ON DELETE CASCADE)"
        )
        conn.execute("INSERT INTO parent(id) VALUES (1)")
        conn.execute("INSERT INTO child(id, parent_id) VALUES (10, 1)")
    _sqlite_executescript_atomic(
        pool,
        """
        PRAGMA foreign_keys = OFF;
        CREATE TABLE parent_new (id INTEGER PRIMARY KEY);
        INSERT INTO parent_new(id) SELECT id FROM parent;
        DROP TABLE parent;
        ALTER TABLE parent_new RENAME TO parent;
        PRAGMA foreign_keys = ON;
        """,
    )
    with pool.connect() as conn:
        # With enforcement on, DROP TABLE parent would have cascaded into child.
        assert conn.execute("SELECT COUNT(*) FROM child").fetchone()[0] == 1
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_foreign_keys_off_applies_inside_transaction(pool: SqlitePool) -> None:
    with _sqlite_foreign_keys_off(pool), pool.transaction() as conn:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 0
    with pool.connect() as conn:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_sqlite_transaction_rolls_back_on_base_exception(tmp_path: Path) -> None:
    db = SqlitePool(tmp_path / "t.db")
    with db.transaction() as conn:
        conn.execute("CREATE TABLE t (v INTEGER)")
    with pytest.raises(KeyboardInterrupt), db.transaction() as conn:
        conn.execute("INSERT INTO t(v) VALUES (1)")
        raise KeyboardInterrupt
    with db.transaction() as conn:  # would fail if BEGIN were still open
        assert conn.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 0
    db.close()
