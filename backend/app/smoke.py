"""Optional real-model smoke test: python -m app.smoke path/to/japanese-audio.ogg."""

import argparse
import json
import time

from faster_whisper.audio import decode_audio

from app.asr.whisper_engine import WhisperEngine
from app.japanese.romanizer import JapaneseRomanizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe an authorized local Japanese sample")
    parser.add_argument("audio")
    parser.add_argument("--model", default="base", choices=["base", "small", "medium"])
    args = parser.parse_args()
    samples = decode_audio(args.audio, sampling_rate=16000)
    started = time.monotonic()
    print("Loading local Whisper (first use downloads model weights)...", flush=True)
    engine = WhisperEngine(args.model, device="cpu", compute_type="int8")
    result = engine.transcribe(samples)
    if result is None:
        raise SystemExit("No Japanese speech recognized")
    print(
        json.dumps(
            {
                "japanese": result.japanese,
                "romaji": JapaneseRomanizer().romanize(result.japanese),
                "confidence": result.confidence,
                "device": engine.active_device,
                "elapsedSeconds": round(time.monotonic() - started, 2),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
