import numpy as np

from app.audio.buffer import AudioRingBuffer


def pcm(values: list[float]) -> bytes:
    return (np.array(values) * 32767).astype("<i2").tobytes()


def test_slice_respects_generation() -> None:
    buffer = AudioRingBuffer(15, sample_rate=4)
    buffer.append(pcm([0.1, 0.2, 0.3, 0.4]), 1.0, 2.0, 0)
    assert len(buffer.slice(1.25, 1.75, 0)) == 2
    assert buffer.slice(1.0, 2.0, 1).size == 0


def test_clear() -> None:
    buffer = AudioRingBuffer(15)
    buffer.append(pcm([0.1]), 0, 0.1, 0)
    buffer.clear()
    assert buffer.slice(0, 1, 0).size == 0
