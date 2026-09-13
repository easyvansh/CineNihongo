import asyncio
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.asr.whisper_engine import Transcript, WhisperEngine
from app.cache import ResultCache
from app.config import Settings
from app.main import app
from app.models.schemas import AudioHeader, SubtitleEvent
from app.pipeline import Pipeline
from app.session import SessionManager

HEADERS = {"X-CineNihongo-Protocol": "3"}


def create(client: TestClient) -> str:
    return str(
        client.post(
            "/api/v1/sessions",
            headers=HEADERS,
            json={"filmId": "fixture", "model": "base", "protocolVersion": "3"},
        ).json()["sessionId"]
    )


def test_audio_stream_and_paused_seek() -> None:
    with TestClient(app) as client:
        sid = create(client)
        with client.websocket_connect(f"/api/v1/sessions/{sid}/stream") as ws:
            ws.send_json({"type": "handshake", "protocolVersion": "3"})
            assert ws.receive_json()["type"] == "ready"
            ws.send_json(
                {
                    "type": "audio",
                    "generation": 0,
                    "mediaStart": 0,
                    "mediaEnd": 1,
                    "sampleRate": 16000,
                    "frames": 16000,
                }
            )
            ws.send_bytes(bytes(32000))
            # A sync invalidates the old buffer without requiring more audio.
            ws.send_json({"type": "sync", "generation": 1})
            ws.send_bytes(b"bad")
            assert ws.receive_json()["code"] == "invalid_audio_frame"
            info = client.get(f"/api/v1/sessions/{sid}/diagnostics", headers=HEADERS).json()
            assert info["generation"] == 1
            assert info["bufferedAudioSeconds"] == 0
        assert client.delete(f"/api/v1/sessions/{sid}", headers=HEADERS).status_code in (200, 404)


def test_invalid_stream_header_returns_actionable_error() -> None:
    with TestClient(app) as client:
        sid = create(client)
        with client.websocket_connect(f"/api/v1/sessions/{sid}/stream") as ws:
            ws.send_json({"type": "handshake", "protocolVersion": "3"})
            ws.receive_json()
            ws.send_json({"type": "audio", "generation": -1})
            assert ws.receive_json()["type"] == "error"


def test_session_ownership_and_old_protocol() -> None:
    with TestClient(app) as client:
        sid = create(client)
        body = {
            "id": "x",
            "sessionId": sid,
            "filmId": "wrong",
            "englishText": "",
            "appearedAtVideoTime": 0,
            "disappearedAtVideoTime": 4,
            "detectedAtWallClock": 1,
            "generation": 0,
            "windowKind": "rolling",
        }
        assert (
            client.post(
                f"/api/v1/sessions/{sid}/subtitle-events", headers=HEADERS, json=body
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/api/v1/romanize", headers={"X-CineNihongo-Protocol": "2"}, json={"text": "日本語"}
            ).status_code
            == 426
        )


def test_audio_rejects_nonfinite_and_invalid_duration() -> None:
    for start, end in [(float("nan"), 1), (2, 1), (0, 100)]:
        with pytest.raises(ValidationError):
            AudioHeader(
                type="audio",
                generation=0,
                mediaStart=start,
                mediaEnd=end,
                sampleRate=16000,
                frames=16000,
            )


class FakeEngine(WhisperEngine):
    def transcribe(self, samples: np.typing.NDArray[np.float32]) -> Transcript:
        return Transcript("こんにちは", 0.5, 1.5, 0.9)


def test_rolling_speech_survives_queue_delay_and_short_speech(tmp_path: Path) -> None:
    async def run() -> None:
        manager = SessionManager(15, 1)
        session = manager.create("fixture", "base", 0.65)
        samples = (np.ones(64000) * 5000).astype("<i2").tobytes()
        session.buffer.append(samples, 0, 4, 0)
        event = SubtitleEvent(
            id="one",
            sessionId=session.id,
            filmId="fixture",
            englishText="",
            appearedAtVideoTime=0,
            disappearedAtVideoTime=4,
            detectedAtWallClock=0,
            generation=0,
            windowKind="rolling",
        )
        assert manager.enqueue(event)
        assert not manager.enqueue(event)
        assert not manager.enqueue(event.model_copy(update={"id": "two"}))
        session.buffer.clear()
        pipeline = Pipeline(manager, Settings(), ResultCache(tmp_path / "cache.sqlite"))
        pipeline.engines["base"] = FakeEngine("base")
        await pipeline.process(event)
        assert session.results[0].japanese == "こんにちは"
        assert session.results[0].start == 0.5
        assert session.results[0].end == 1.5
        session.advance(1)
        await pipeline.process(event)
        assert len(session.results) == 1
        await manager.delete(session.id)
        await manager.publish(session, session.results[0])
        assert len(session.results) == 1

    asyncio.run(run())


def test_cuda_inference_failure_retries_on_cpu(monkeypatch: pytest.MonkeyPatch) -> None:
    import faster_whisper

    class BrokenModel:
        def transcribe(self, *_args: object, **_kwargs: object) -> object:
            raise RuntimeError("CUDA runtime missing")

    class CPUModel:
        def transcribe(self, *_args: object, **kwargs: object) -> object:
            assert kwargs["language"] == "ja"
            return iter(
                [SimpleNamespace(text="こんにちは", start=0.0, end=1.0, avg_logprob=-0.1)]
            ), None

    monkeypatch.setattr(faster_whisper, "WhisperModel", lambda *_a, **_k: CPUModel())
    engine = WhisperEngine("base")
    engine._model = BrokenModel()
    engine.active_device = "cuda"
    result = engine.transcribe(np.ones(16000, dtype=np.float32))
    assert result is not None and result.japanese == "こんにちは"
    assert engine.active_device == "cpu-fallback"


def test_cpu_model_failure_records_diagnostics(monkeypatch: pytest.MonkeyPatch) -> None:
    import faster_whisper

    def broken(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("Model download unavailable")

    monkeypatch.setattr(faster_whisper, "WhisperModel", broken)
    engine = WhisperEngine("base", device="cpu")
    with pytest.raises(RuntimeError, match="download unavailable"):
        engine.transcribe(np.ones(16000, dtype=np.float32))
    assert engine.state == "failed"
    assert engine.last_error == "Model download unavailable"
