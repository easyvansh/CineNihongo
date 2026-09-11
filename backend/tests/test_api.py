from fastapi.testclient import TestClient

from app.main import app


HEADERS = {"X-CineNihongo-Protocol": "1"}


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_session_lifecycle_and_romanize() -> None:
    with TestClient(app) as client:
        created = client.post("/api/v1/sessions", headers=HEADERS, json={"filmId": "17962", "model": "small", "confidenceThreshold": 0.65, "protocolVersion": "1"})
        assert created.status_code == 201
        session_id = created.json()["sessionId"]
        assert client.get(f"/api/v1/sessions/{session_id}/results", headers=HEADERS).json() == {"results": []}
        assert "konnichiha" in client.post("/api/v1/romanize", headers=HEADERS, json={"text": "こんにちは"}).json()["romaji"]
        assert client.delete(f"/api/v1/sessions/{session_id}", headers=HEADERS).status_code == 200


def test_protocol_required() -> None:
    with TestClient(app) as client:
        assert client.post("/api/v1/romanize", json={"text": "日本語"}).status_code == 426
