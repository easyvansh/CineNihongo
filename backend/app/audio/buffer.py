from collections import deque
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray


@dataclass
class AudioBlock:
    start: float
    end: float
    generation: int
    samples: NDArray[np.float32]


class AudioRingBuffer:
    def __init__(self, capacity_seconds: float, sample_rate: int = 16000) -> None:
        self.capacity_seconds = capacity_seconds
        self.sample_rate = sample_rate
        self._blocks: deque[AudioBlock] = deque()

    def append(self, pcm16: bytes, start: float, end: float, generation: int) -> None:
        samples = np.frombuffer(pcm16, dtype="<i2").astype(np.float32) / 32768.0
        if not samples.size:
            return
        self._blocks.append(AudioBlock(start, end, generation, samples))
        cutoff = end - self.capacity_seconds
        while self._blocks and self._blocks[0].end < cutoff:
            self._blocks.popleft()

    def slice(self, start: float, end: float, generation: int) -> NDArray[np.float32]:
        pieces: list[NDArray[np.float32]] = []
        for block in self._blocks:
            if block.generation != generation or block.end <= start or block.start >= end:
                continue
            duration = block.end - block.start
            if duration <= 0:
                continue
            left = max(0, round((start - block.start) / duration * len(block.samples)))
            right = min(
                len(block.samples), round((end - block.start) / duration * len(block.samples))
            )
            if right > left:
                pieces.append(block.samples[left:right])
        return np.concatenate(pieces) if pieces else np.empty(0, dtype=np.float32)

    def clear(self) -> None:
        self._blocks.clear()

    @property
    def duration(self) -> float:
        return sum(max(0.0, block.end - block.start) for block in self._blocks)
