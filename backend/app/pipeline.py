import asyncio
import logging

from app.alignment.aligner import score_alignment
from app.asr.whisper_engine import WhisperEngine
from app.audio.vad import speech_only
from app.cache import ResultCache
from app.config import Settings
from app.japanese.romanizer import JapaneseRomanizer
from app.models.schemas import AlignedSubtitle
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
            self.engines[model] = WhisperEngine(model, self.settings.device, self.settings.compute_type)
        return self.engines[model]

    async def run(self) -> None:
        while self.running:
            event = await self.manager.queue.get()
            try:
                await self.process(event)
            except Exception:
                session = self.manager.get(event.sessionId)
                if session:
                    session.last_error = f"Failed to process cue {event.id}"
                logger.exception("Failed to process cue %s", event.id)
            finally:
                self.manager.queued.discard(event.id)
                self.manager.queue.task_done()

    async def process(self, event: object) -> None:
        from app.models.schemas import SubtitleEvent

        if not isinstance(event, SubtitleEvent):
            return
        session = self.manager.get(event.sessionId)
        if not session or event.generation != session.generation or event.disappearedAtVideoTime is None:
            return
        start = max(0, event.appearedAtVideoTime - self.settings.lead_padding)
        end = event.disappearedAtVideoTime + self.settings.tail_padding
        key = self.cache.key(event.filmId, start, end, session.model)
        cached = self.cache.get(key)
        if cached:
            cached = cached.model_copy(update={"subtitleId": event.id, "english": event.englishText, "source": "cache"})
            await self.manager.publish(session, cached)
            return
        await asyncio.sleep(self.settings.tail_padding)
        samples = speech_only(session.buffer.slice(start, end, event.generation))
        if samples.size < 1600:
            return
        transcript = await asyncio.wait_for(
            asyncio.to_thread(self.engine(session.model).transcribe, samples),
            timeout=self.settings.asr_timeout_seconds,
        )
        if not transcript or event.generation != session.generation:
            return
        segment_start = start + transcript.start
        segment_end = start + transcript.end
        score = score_alignment(event.appearedAtVideoTime, event.disappearedAtVideoTime, segment_start, segment_end, transcript.confidence)
        if score.value < session.confidence_threshold:
            return
        result = AlignedSubtitle(
            subtitleId=event.id,
            filmId=event.filmId,
            english=event.englishText,
            japanese=transcript.japanese,
            romaji=self.romanizer.romanize(transcript.japanese),
            start=event.appearedAtVideoTime,
            end=event.disappearedAtVideoTime,
            confidence=score.value,
            source="whisper",
        )
        self.cache.put(key, result)
        await self.manager.publish(session, result)
