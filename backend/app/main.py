import asyncio
import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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
    worker = asyncio.create_task(pipeline.run())
    yield
    pipeline.running = False
    worker.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await worker


app = FastAPI(title="CineNihongo", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://cinejoy.to"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-CineNihongo-Protocol"],
)


def require_protocol(value: str | None) -> None:
    if value != PROTOCOL_VERSION:
        raise HTTPException(426, detail={"code": "protocol_mismatch", "expected": PROTOCOL_VERSION})


@app.get("/health")
async def health() -> dict[str, object]:
    devices = {name: engine.active_device for name, engine in pipeline.engines.items()}
    return {"status": "ok", "version": app.version, "protocolVersion": PROTOCOL_VERSION, "model": settings.model, "device": devices.get(settings.model, settings.device), "queueDepth": manager.queue.qsize()}


@app.post("/api/v1/sessions", response_model=SessionCreated, status_code=201)
async def create_session(body: SessionCreate, x_cinenihongo_protocol: str | None = Header(None)) -> SessionCreated:
    require_protocol(x_cinenihongo_protocol)
    if body.protocolVersion != PROTOCOL_VERSION:
        raise HTTPException(426, "Unsupported protocol version")
    session = manager.create(body.filmId, body.model, body.confidenceThreshold)
    return SessionCreated(sessionId=session.id)


@app.delete("/api/v1/sessions/{session_id}")
async def delete_session(session_id: str, x_cinenihongo_protocol: str | None = Header(None)) -> dict[str, bool]:
    require_protocol(x_cinenihongo_protocol)
    if not manager.get(session_id):
        raise HTTPException(404, "Unknown session")
    await manager.delete(session_id)
    return {"stopped": True}


@app.post("/api/v1/sessions/{session_id}/subtitle-events", status_code=202)
async def subtitle_event(session_id: str, event: SubtitleEvent, x_cinenihongo_protocol: str | None = Header(None)) -> dict[str, bool]:
    require_protocol(x_cinenihongo_protocol)
    session = manager.get(session_id)
    if not session or event.sessionId != session_id or event.filmId != session.film_id:
        raise HTTPException(404, "Unknown session")
    if event.disappearedAtVideoTime is not None and event.disappearedAtVideoTime < event.appearedAtVideoTime:
        raise HTTPException(422, "Cue end precedes cue start")
    if event.generation > session.generation:
        session.generation = event.generation
        session.buffer.clear()
    if event.generation < session.generation:
        return {"accepted": False}
    if not manager.enqueue(event):
        raise HTTPException(429, detail={"code": "queue_full_or_duplicate"})
    return {"accepted": True}


@app.post("/api/v1/romanize", response_model=RomanizeResponse)
async def romanize(body: RomanizeRequest, x_cinenihongo_protocol: str | None = Header(None)) -> RomanizeResponse:
    require_protocol(x_cinenihongo_protocol)
    return RomanizeResponse(japanese=body.text, romaji=romanizer.romanize(body.text))


@app.get("/api/v1/sessions/{session_id}/results")
async def results(session_id: str, x_cinenihongo_protocol: str | None = Header(None)) -> dict[str, object]:
    require_protocol(x_cinenihongo_protocol)
    session = manager.get(session_id)
    if not session:
        raise HTTPException(404, "Unknown session")
    return {"results": [result.model_dump() for result in session.results]}


@app.websocket("/api/v1/sessions/{session_id}/stream")
async def stream_audio(websocket: WebSocket, session_id: str) -> None:
    session = manager.get(session_id)
    if not session:
        await websocket.close(code=4404, reason="Unknown session")
        return
    await websocket.accept()
    session.sockets.add(websocket)
    try:
        handshake = await websocket.receive_json()
        if handshake.get("type") != "handshake" or handshake.get("protocolVersion") != PROTOCOL_VERSION:
            await websocket.close(code=4426, reason="Protocol mismatch")
            return
        await websocket.send_json({"type": "ready", "protocolVersion": PROTOCOL_VERSION})
        while True:
            message = await websocket.receive()
            if message.get("text") is not None:
                header = AudioHeader.model_validate_json(message["text"])
                if header.generation > session.generation:
                    session.generation = header.generation
                    session.buffer.clear()
                session.pending_audio = header
            elif message.get("bytes") is not None:
                header = session.pending_audio
                payload: bytes = message["bytes"]
                if header is None or len(payload) != header.frames * 2:
                    await websocket.send_json({"type": "error", "code": "invalid_audio_frame", "detail": "Audio header/payload mismatch"})
                    continue
                if header.generation == session.generation:
                    session.buffer.append(payload, header.mediaStart, header.mediaEnd, header.generation)
                session.pending_audio = None
    except WebSocketDisconnect:
        pass
    finally:
        session.sockets.discard(websocket)
