"""Spend guard for the Meta API credit.

Every Meta call records an estimated cost. Once the running total passes the cap,
further calls raise BudgetExceeded instead of reaching the API.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

# Official prices (dev.meta.ai/docs/pricing-rate-limits, read 2026-11-03).
PRICES = {
    "spark_in_per_m": 1.25,
    "spark_out_per_m": 4.25,
    "wonder_in_per_m": 4.00,
    "wonder_out_per_m": 20.00,
    "sam_per_image": 2.50 / 1000,
    "sam_per_frame": 0.20 / 1000,
    "image_per_image": 0.01,
    "voice_per_hour": 0.18,
}


class BudgetExceeded(RuntimeError):
    pass


class CostLedger:
    def __init__(self, path: Path, cap_usd: float) -> None:
        self.path = path
        self.cap_usd = cap_usd
        self._lock = threading.Lock()
        self._data = {"total_usd": 0.0, "by_kind": {}}
        if path.exists():
            self._data = json.loads(path.read_text(encoding="utf-8"))

    @property
    def total(self) -> float:
        return self._data["total_usd"]

    def check(self) -> None:
        if self.total >= self.cap_usd:
            raise BudgetExceeded(f"Spend cap reached: ${self.total:.2f} of ${self.cap_usd:.2f}")

    def record(self, kind: str, usd: float) -> None:
        with self._lock:
            self._data["total_usd"] = round(self.total + usd, 6)
            self._data["by_kind"][kind] = round(self._data["by_kind"].get(kind, 0.0) + usd, 6)
            self.path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")

    def summary(self) -> dict:
        return {"cap_usd": self.cap_usd, **self._data}


def llm_cost(model_kind: str, input_tokens: int, output_tokens: int) -> float:
    prefix = "wonder" if model_kind == "wonder" else "spark"
    return (input_tokens * PRICES[f"{prefix}_in_per_m"] + output_tokens * PRICES[f"{prefix}_out_per_m"]) / 1_000_000
