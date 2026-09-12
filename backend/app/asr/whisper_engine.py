import logging
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Transcript:
    japanese: str
    start: float
    end: float
    confidence: float


class WhisperEngine:
    def __init__(self, model_name: str, device: str = "auto", compute_type: str = "auto") -> None:
        self.model_name = model_name
        self.requested_device = device
        self.requested_compute_type = compute_type
        self.active_device = "not-loaded"
        self.state = "not-loaded"
        self.last_error: str | None = None
        self._model: Any = None
        self._lock = threading.Lock()

    def _load(self) -> Any:
        if self._model is not None:
            return self._model
        from faster_whisper import WhisperModel

        self.state = "downloading"
        device = "cuda" if self.requested_device == "auto" else self.requested_device
        compute = (
            "float16"
            if self.requested_compute_type == "auto" and device == "cuda"
            else self.requested_compute_type
        )
        if compute == "auto":
            compute = "int8"
        try:
            self._model = WhisperModel(self.model_name, device=device, compute_type=compute)
            self.active_device = device
            self.state = "ready"
        except Exception:
            if device == "cpu":
                raise
            logger.warning("CUDA model load failed; falling back to CPU", exc_info=True)
            try:
                self._model = WhisperModel(self.model_name, device="cpu", compute_type="int8")
                self.active_device = "cpu-fallback"
                self.state = "ready"
            except Exception as error:
                self.state = "failed"
                self.last_error = str(error)
                raise
        return self._model

    def transcribe(self, samples: NDArray[np.float32]) -> Transcript | None:
        if samples.size == 0:
            return None
        with self._lock:
            model = self._load()
            segments, _ = model.transcribe(
                samples, language="ja", beam_size=5, word_timestamps=True, vad_filter=False
            )
            materialized = list(segments)
        text = "".join(segment.text.strip() for segment in materialized).strip()
        if not text:
            return None
        avg_logprob = sum(segment.avg_logprob for segment in materialized) / len(materialized)
        confidence = max(0.0, min(1.0, np.exp(avg_logprob)))
        return Transcript(text, materialized[0].start, materialized[-1].end, float(confidence))
