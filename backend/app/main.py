import asyncio
import contextlib
import json
import re
from collections.abc import AsyncIterator

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from app.cache import ResultCache
from app.config import get_settings
from app.japanese.romanizer import JapaneseRomanizer
from app.models.schemas import (
    PROTOCOL_VERSION,
    AudioHeader,
    RomanizeRequest,
    RomanizeResponse,
    SessionCreate,
    SessionCreated,
    SubtitleEvent,
    SyncHeader,
)
from app.pipeline import Pipeline
from app.session import SessionManager

settings = get_settings()
cache = ResultCache(settings.database_path)
manager = SessionManager(settings.ring_buffer_seconds, settings.queue_size)
pipeline = Pipeline(manager, settings, cache)
romanizer = JapaneseRomanizer()


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    manager.queue = asyncio.Queue(maxsize=settings.queue_size)
    manager.queued.clear()
    manager.audio.clear()
    pipeline.running = True
    worker = asyncio.create_task(pipeline.run())
    yield
    pipeline.running = False
    worker.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await worker
    for session_id in list(manager.sessions):
        await manager.delete(session_id)


app = FastAPI(title="CineNihongo", version="1.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"chrome-extension://[a-p]{32}",
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-CineNihongo-Protocol"],
)


def require_protocol(value: str | None) -> None:
    if value != PROTOCOL_VERSION:
        raise HTTPException(426, detail={"code": "protocol_mismatch", "expected": PROTOCOL_VERSION})


@app.get("/health")
async def health() -> dict[str, object]:
    devices = {name: engine.active_device for name, engine in pipeline.engines.items()}
    return {
        "status": "ok",
        "version": app.version,
        "protocolVersion": PROTOCOL_VERSION,
        "model": settings.model,
        "device": devices.get(settings.model, settings.device),
        "queueDepth": manager.queue.qsize(),
    }


@app.get("/api/v1/diagnostics")
async def diagnostics() -> dict[str, object]:
    return {
        "status": "ok",
        "version": app.version,
        "protocolVersion": PROTOCOL_VERSION,
        "sessions": len(manager.sessions),
        "queueDepth": manager.queue.qsize(),
        "models": {
            name: {
                "state": engine.state,
                "device": engine.active_device,
                "lastError": engine.last_error,
            }
            for name, engine in pipeline.engines.items()
        },
    }


@app.post("/api/v1/sessions", response_model=SessionCreated, status_code=201)
async def create_session(
    body: SessionCreate, x_cinenihongo_protocol: str | None = Header(None)
) -> SessionCreated:
    require_protocol(x_cinenihongo_protocol)
    if body.protocolVersion != PROTOCOL_VERSION:
        raise HTTPException(426, "Unsupported protocol version")
    session = manager.create(body.filmId, body.model, body.confidenceThreshold)
    return SessionCreated(sessionId=session.id)


@app.delete("/api/v1/sessions/{session_id}")
async def delete_session(
    session_id: str, x_cinenihongo_protocol: str | None = Header(None)
) -> dict[str, bool]:
    require_protocol(x_cinenihongo_protocol)
    if not manager.get(session_id):
        raise HTTPException(404, "Unknown session")
    await manager.delete(session_id)
    return {"stopped": True}


@app.post("/api/v1/sessions/{session_id}/subtitle-events", status_code=202)
async def subtitle_event(
    session_id: str, event: SubtitleEvent, x_cinenihongo_protocol: str | None = Header(None)
) -> dict[str, bool]:
    require_protocol(x_cinenihongo_protocol)
    session = manager.get(session_id)
    if not session or event.sessionId != session_id or event.filmId != session.film_id:
        raise HTTPException(404, "Unknown session")
    if (
        event.disappearedAtVideoTime is not None
        and event.disappearedAtVideoTime < event.appearedAtVideoTime
    ):
        raise HTTPException(422, "Cue end precedes cue start")
    if event.generation > session.generation:
        session.advance(event.generation)
    if event.generation < session.generation:
        return {"accepted": False}
    session.last_cue = event.id
    if event.id in session.seen:
        return {"accepted": False}
    if not manager.enqueue(event):
        raise HTTPException(429, detail={"code": "queue_full_or_duplicate"})
    return {"accepted": True}


@app.post("/api/v1/romanize", response_model=RomanizeResponse)
async def romanize(
    body: RomanizeRequest, x_cinenihongo_protocol: str | None = Header(None)
) -> RomanizeResponse:
    require_protocol(x_cinenihongo_protocol)
    return RomanizeResponse(japanese=body.text, romaji=romanizer.romanize(body.text))


@app.get("/api/v1/sessions/{session_id}/results")
async def results(
    session_id: str, x_cinenihongo_protocol: str | None = Header(None)
) -> dict[str, object]:
    require_protocol(x_cinenihongo_protocol)
    session = manager.get(session_id)
    if not session:
        raise HTTPException(404, "Unknown session")
    return {"results": [result.model_dump() for result in session.results]}


@app.get("/api/v1/sessions/{session_id}/diagnostics")
async def session_diagnostics(
    session_id: str, x_cinenihongo_protocol: str | None = Header(None)
) -> dict[str, object]:
    require_protocol(x_cinenihongo_protocol)
    session = manager.get(session_id)
    if not session:
        raise HTTPException(404, "Unknown session")
    engine = pipeline.engines.get(session.model)
    return {
        "sessionId": session.id,
        "filmId": session.film_id,
        "generation": session.generation,
        "bufferedAudioSeconds": session.buffer.duration,
        "receivedAudioFrames": session.received_frames,
        "queueDepth": manager.queue.qsize(),
        "lastCue": session.last_cue,
        "resultCount": len(session.results),
        "modelState": engine.state if engine else "not-loaded",
        "modelDevice": engine.active_device if engine else "not-loaded",
        "lastError": session.last_error,
    }


@app.websocket("/api/v1/sessions/{session_id}/stream")
async def stream_audio(websocket: WebSocket, session_id: str) -> None:
    origin = websocket.headers.get("origin", "")
    if origin and not re.fullmatch(r"chrome-extension://[a-p]{32}", origin):
        await websocket.close(code=4403, reason="Extension origin required")
        return
    session = manager.get(session_id)
    if not session:
        await websocket.close(code=4404, reason="Unknown session")
        return
    if session.sockets:
        await websocket.close(code=4409, reason="Session already has an audio stream")
        return
    await websocket.accept()
    session.sockets.add(websocket)
    try:
        handshake = await asyncio.wait_for(websocket.receive_json(), timeout=5)
        if not isinstance(handshake, dict):
            raise ValueError("Invalid handshake")
        if (
            handshake.get("type") != "handshake"
            or handshake.get("protocolVersion") != PROTOCOL_VERSION
        ):
            await websocket.close(code=4426, reason="Protocol mismatch")
            return
        await websocket.send_json({"type": "ready", "protocolVersion": PROTOCOL_VERSION})
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            if message.get("text") is not None:
                raw = json.loads(message["text"])
                if not isinstance(raw, dict):
                    raise ValueError("Expected an audio or sync object")
                if raw.get("type") == "sync":
                    control = SyncHeader.model_validate(raw)
                    session.advance(control.generation)
                    continue
                if session.pending_audio is not None:
                    raise ValueError("Audio header must be followed by its payload")
                header = AudioHeader.model_validate(raw)
                if header.generation > session.generation:
                    session.advance(header.generation)
                session.pending_audio = header
            elif message.get("bytes") is not None:
                pending_header = session.pending_audio
                payload: bytes = message["bytes"]
                if pending_header is None or len(payload) != pending_header.frames * 2:
                    session.pending_audio = None
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "invalid_audio_frame",
                            "detail": "Audio header/payload mismatch",
                        }
                    )
                    continue
                if pending_header.generation == session.generation:
                    if (
                        session.last_audio_end is not None
                        and pending_header.mediaStart < session.last_audio_end - 0.02
                    ):
                        raise ValueError(
                            "Audio timestamps moved backwards without a new generation"
                        )
                    session.buffer.append(
                        payload,
                        pending_header.mediaStart,
                        pending_header.mediaEnd,
                        pending_header.generation,
                    )
                    session.received_frames += pending_header.frames
                    session.last_audio_end = pending_header.mediaEnd
                session.pending_audio = None
    except WebSocketDisconnect:
        pass
    except (ValidationError, ValueError, TimeoutError) as error:
        with contextlib.suppress(RuntimeError):
            await websocket.send_json(
                {"type": "error", "code": "invalid_audio_frame", "detail": str(error)}
            )
            await websocket.close(code=4400)
    finally:
        session.sockets.discard(websocket)
        # A terminated capture has no producer; release its in-memory session.
        await manager.delete(session_id)
