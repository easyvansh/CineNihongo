import asyncio
from dataclasses import dataclass, field
from uuid import uuid4

import numpy as np
from fastapi import WebSocket
from numpy.typing import NDArray

from app.audio.buffer import AudioRingBuffer
from app.models.schemas import AlignedSubtitle, AudioHeader, SubtitleEvent


@dataclass
class Session:
    id: str
    film_id: str
    model: str
    confidence_threshold: float
    buffer: AudioRingBuffer
    generation: int = 0
    pending_audio: AudioHeader | None = None
    sockets: set[WebSocket] = field(default_factory=set)
    results: list[AlignedSubtitle] = field(default_factory=list)
    received_frames: int = 0
    last_cue: str | None = None
    last_error: str | None = None
    seen: set[str] = field(default_factory=set)
    last_audio_end: float | None = None

    def advance(self, generation: int) -> None:
        if generation > self.generation:
            self.generation = generation
            self.buffer.clear()
            self.pending_audio = None
            self.last_audio_end = None


class SessionManager:
    def __init__(self, buffer_seconds: int, queue_size: int) -> None:
        self.buffer_seconds = buffer_seconds
        self.sessions: dict[str, Session] = {}
        self.queue: asyncio.Queue[SubtitleEvent] = asyncio.Queue(maxsize=queue_size)
        self.queued: set[str] = set()
        self.audio: dict[str, NDArray[np.float32]] = {}

    def create(self, film_id: str, model: str, threshold: float) -> Session:
        session_id = str(uuid4())
        session = Session(
            session_id, film_id, model, threshold, AudioRingBuffer(self.buffer_seconds)
        )
        self.sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        return self.sessions.get(session_id)

    async def delete(self, session_id: str) -> None:
        session = self.sessions.pop(session_id, None)
        if session:
            session.buffer.clear()
            for socket in list(session.sockets):
                try:
                    await socket.close(code=1000)
                except (RuntimeError, OSError):
                    pass

    def enqueue(self, event: SubtitleEvent) -> bool:
        session = self.get(event.sessionId)
        if not session or event.id in session.seen or self.queue.full():
            return False
        if len(session.seen) >= 4096:
            session.seen.clear()
        session.seen.add(event.id)
        # Snapshot at submission: queued inference/model download may outlive the ring.
        self.audio[event.id] = session.buffer.slice(
            event.appearedAtVideoTime,
            event.disappearedAtVideoTime or event.appearedAtVideoTime,
            event.generation,
        ).copy()
        self.queued.add(event.id)
        self.queue.put_nowait(event)
        return True

    async def publish(self, session: Session, result: AlignedSubtitle) -> None:
        if self.get(session.id) is not session or result.generation != session.generation:
            return
        session.results.append(result)
        del session.results[:-200]
        dead: list[WebSocket] = []
        for socket in session.sockets:
            try:
                await socket.send_json(
                    {
                        "type": "result",
                        "protocolVersion": "3",
                        "result": result.model_dump(),
                    }
                )
            except (RuntimeError, OSError):
                dead.append(socket)
        for socket in dead:
            session.sockets.discard(socket)

    async def status(
        self,
        session: Session,
        model_state: str,
        detail: str | None = None,
        code: str | None = None,
    ) -> None:
        for socket in list(session.sockets):
            try:
                await socket.send_json(
                    {
                        "type": "status",
                        "modelState": model_state,
                        "detail": detail,
                        "code": code,
                        "queueDepth": self.queue.qsize(),
                        "bufferedAudioSeconds": session.buffer.duration,
                    }
                )
            except (RuntimeError, OSError):
                session.sockets.discard(socket)
