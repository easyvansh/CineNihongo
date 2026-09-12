import json
import sqlite3
import threading
from pathlib import Path

from app.models.schemas import AlignedSubtitle


class ResultCache:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        self.connection.execute(
            "CREATE TABLE IF NOT EXISTS results ("
            "cache_key TEXT PRIMARY KEY, "
            "film_id TEXT NOT NULL, "
            "payload TEXT NOT NULL, "
            "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        self.connection.commit()

    @staticmethod
    def key(film_id: str, start: float, end: float, model: str, pipeline: str = "1") -> str:
        return f"{film_id}:{start:.2f}:{end:.2f}:{model}:{pipeline}"

    def get(self, key: str) -> AlignedSubtitle | None:
        with self.lock:
            row = self.connection.execute(
                "SELECT payload FROM results WHERE cache_key=?", (key,)
            ).fetchone()
        return AlignedSubtitle.model_validate_json(row[0]) if row else None

    def put(self, key: str, result: AlignedSubtitle) -> None:
        with self.lock:
            self.connection.execute(
                "INSERT OR REPLACE INTO results(cache_key, film_id, payload) VALUES(?,?,?)",
                (key, result.filmId, json.dumps(result.model_dump())),
            )
            self.connection.commit()
