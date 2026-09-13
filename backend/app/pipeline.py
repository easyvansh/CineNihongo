import asyncio
import logging

from app.asr.whisper_engine import WhisperEngine
from app.audio.vad import speech_only
from app.cache import ResultCache
from app.config import Settings
from app.japanese.romanizer import JapaneseRomanizer
from app.models.schemas import AlignedSubtitle, SubtitleEvent
from app.session import SessionManager

logger = logging.getLogger(__name__)


class Pipeline:
    def __init__(self, manager: SessionManager, settings: Settings, cache: ResultCache) -> None:
        self.manager = manager
        self.settings = settings
        self.cache = cache
        self.romanizer = JapaneseRomanizer()
        self.engines: dict[str, WhisperEngine] = {}
        self.running = True

    def engine(self, model: str) -> WhisperEngine:
        if model not in self.engines:
            self.engines[model] = WhisperEngine(
                model, self.settings.device, self.settings.compute_type
            )
        return self.engines[model]

    async def run(self) -> None:
        while self.running:
            event = await self.manager.queue.get()
            try:
                await self.process(event)
            except Exception as error:
                session = self.manager.get(event.sessionId)
                if session:
                    session.last_error = str(error)
                    await self.manager.status(session, "failed", str(error), "MODEL_FAILED")
                logger.exception("Failed to process cue %s", event.id)
            finally:
                self.manager.queued.discard(event.id)
                self.manager.audio.pop(event.id, None)
                self.manager.queue.task_done()

    async def process(self, event: SubtitleEvent) -> None:
        session = self.manager.get(event.sessionId)
        if not session or event.generation != session.generation:
            return
        end = event.disappearedAtVideoTime
        if end is None:
            return
        if (
            self.manager.queue.qsize() > 0
            and session.last_audio_end is not None
            and session.last_audio_end - end > 4 * event.playbackRate
        ):
            await self.manager.status(session, "ready", "Skipping older queued audio to catch up.")
            return
        start = event.appearedAtVideoTime
        key = self.cache.key(
            event.filmId, start, end, session.model, f"3:{event.windowKind}:{event.playbackRate}"
        )
        cached = self.cache.get(key)
        if cached and cached.confidence >= session.confidence_threshold:
            cached = cached.model_copy(
                update={
                    "subtitleId": event.id,
                    "english": event.englishText,
                    "source": "cache",
                    "sessionId": session.id,
                    "generation": event.generation,
                }
            )
            await self.manager.publish(session, cached)
            return
        samples = self.manager.audio.get(event.id)
        if samples is None:
            samples = session.buffer.slice(start, end, event.generation)
        # Gate silence without trimming: removing leading samples corrupts timestamps.
        if speech_only(samples).size < 1600:
            await self.manager.status(session, "ready", "No speech in this window.")
            return
        engine = self.engine(session.model)
        await self.manager.status(session, "loading" if engine.state != "ready" else "transcribing")
        task = asyncio.create_task(asyncio.to_thread(engine.transcribe, samples))
        try:
            transcript = await asyncio.wait_for(
                asyncio.shield(task), timeout=self.settings.asr_timeout_seconds
            )
        except TimeoutError:
            await self.manager.status(
                session,
                engine.state,
                "Model loading or transcription is taking longer than expected. "
                "Use base on slower CPUs; initial model download requires internet.",
                "QUEUE_FULL",
            )
            # Python cannot cancel a native inference thread. Keep a single in-flight
            # job instead of leaking one thread per timeout and saturating the CPU.
            transcript = await task
        if (
            not transcript
            or event.generation != session.generation
            or self.manager.get(session.id) is not session
        ):
            return
        # Caption overlap is not ASR confidence; short speech inside a four-second
        # rolling window must not be rejected merely for having surrounding silence.
        if transcript.confidence < session.confidence_threshold:
            await self.manager.status(session, "ready", "Speech confidence below threshold.")
            return
        result = AlignedSubtitle(
            subtitleId=event.id,
            sessionId=session.id,
            generation=event.generation,
            filmId=event.filmId,
            english=event.englishText,
            japanese=transcript.japanese,
            romaji=self.romanizer.romanize(transcript.japanese),
            start=max(start, start + transcript.start * event.playbackRate),
            end=min(end, start + transcript.end * event.playbackRate),
            confidence=transcript.confidence,
            source="whisper",
        )
        if result.end <= result.start:
            return
        self.cache.put(key, result)
        await self.manager.publish(session, result)
        session.last_error = None
        await self.manager.status(session, "ready")
