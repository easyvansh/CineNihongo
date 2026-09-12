import asyncio
from dataclasses import dataclass, field
from uuid import uuid4

from fastapi import WebSocket

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


class SessionManager:
    def __init__(self, buffer_seconds: int, queue_size: int) -> None:
        self.buffer_seconds = buffer_seconds
        self.sessions: dict[str, Session] = {}
        self.queue: asyncio.Queue[SubtitleEvent] = asyncio.Queue(maxsize=queue_size)
        self.queued: set[str] = set()

    def create(self, film_id: str, model: str, threshold: float) -> Session:
        session_id = str(uuid4())
        session = Session(session_id, film_id, model, threshold, AudioRingBuffer(self.buffer_seconds))
        self.sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Session | None:
        return self.sessions.get(session_id)

    async def delete(self, session_id: str) -> None:
        session = self.sessions.pop(session_id, None)
        if session:
            session.buffer.clear()
            for socket in list(session.sockets):
                await socket.close(code=1000)

    def enqueue(self, event: SubtitleEvent) -> bool:
        if event.id in self.queued or self.queue.full():
            return False
        self.queued.add(event.id)
        self.queue.put_nowait(event)
        return True

    async def publish(self, session: Session, result: AlignedSubtitle) -> None:
        session.results.append(result)
        dead: list[WebSocket] = []
        for socket in session.sockets:
            try:
                await socket.send_json({"type": "result", "protocolVersion": "1", "result": result.model_dump()})
            except RuntimeError:
                dead.append(socket)
        for socket in dead:
            session.sockets.discard(socket)
