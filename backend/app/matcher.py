"""Live Modeling matcher: maps streaming transcript text to hotspot ids.

Runs locally on every partial transcript, so it must be fast and deterministic.
No model calls happen here.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

WORD_RE = re.compile(r"[\w']+", re.UNICODE)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).casefold()
    return " ".join(WORD_RE.findall(text))


def _stem(word: str) -> str:
    for suffix in ("'s", "ies", "es", "s"):
        if len(word) > len(suffix) + 2 and word.endswith(suffix):
            return word[: -len(suffix)] + ("y" if suffix == "ies" else "")
    return word


def _stem_phrase(phrase: str) -> tuple[str, ...]:
    return tuple(_stem(w) for w in normalize(phrase).split())


@dataclass
class HotspotTerms:
    hotspot_id: str
    terms: list[str]


class LiveMatcher:
    """Finds hotspot terms inside a growing transcript and reports each new hit once."""

    def __init__(self, hotspots: list[HotspotTerms]) -> None:
        self._terms: list[tuple[tuple[str, ...], str]] = []
        for hs in hotspots:
            for term in hs.terms:
                stems = _stem_phrase(term)
                if stems:
                    self._terms.append((stems, hs.hotspot_id))
        # Longer phrases first so "grandma's cup" beats "cup".
        self._terms.sort(key=lambda item: len(item[0]), reverse=True)
        self._emitted: set[tuple[int, str]] = set()

    def reset_turn(self) -> None:
        """Call when a turn is final, before feeding the next turn's transcript."""
        self._emitted.clear()

    def feed(self, cumulative_transcript: str) -> list[str]:
        """Feed the full transcript of the current turn; returns hotspot ids newly mentioned.

        Each (word position, hotspot) pair is reported once per turn, so repeated
        partial transcripts do not re-trigger the same mention.
        """
        words = [_stem(w) for w in normalize(cumulative_transcript).split()]
        hits: list[str] = []
        i = 0
        while i < len(words):
            matched = False
            for stems, hotspot_id in self._terms:
                n = len(stems)
                if tuple(words[i:i + n]) == stems:
                    if (i, hotspot_id) not in self._emitted:
                        self._emitted.add((i, hotspot_id))
                        hits.append(hotspot_id)
                    i += n
                    matched = True
                    break
            if not matched:
                i += 1
        return hits
