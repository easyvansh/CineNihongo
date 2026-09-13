"""Deterministic inference double for optional browser capture integration tests.

Run from backend with uvicorn browser_backend:app --app-dir tests --port 8765.
It uses the real HTTP/WebSocket/audio pipeline but avoids downloading model weights.
"""

import numpy as np
from numpy.typing import NDArray

from app.asr.whisper_engine import Transcript, WhisperEngine
from app.main import app, pipeline

__all__ = ["app"]


class FixtureEngine(WhisperEngine):
    def transcribe(self, samples: NDArray[np.float32]) -> Transcript | None:
        self.state = "ready"
        return Transcript("こんにちは", 0, min(2, samples.size / 16000), 0.99)


pipeline.engines["base"] = FixtureEngine("base", device="cpu")
