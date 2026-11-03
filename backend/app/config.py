"""Runtime settings, read once from the environment and the project .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    model_api_key: str
    meta_base_url: str
    data_dir: Path
    cost_cap_usd: float
    spark_model: str
    wonder_model: str
    image_model: str
    voice_model: str
    sam_model: str

    @property
    def has_api_key(self) -> bool:
        return bool(self.model_api_key)


def load_settings() -> Settings:
    data_dir = Path(os.environ.get("MOMENTALK_DATA_DIR", PROJECT_ROOT / "backend" / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        model_api_key=os.environ.get("MODEL_API_KEY", ""),
        meta_base_url=os.environ.get("META_BASE_URL", "https://api.meta.ai/v1"),
        data_dir=data_dir,
        cost_cap_usd=float(os.environ.get("MOMENTALK_COST_CAP_USD", "60")),
        spark_model=os.environ.get("MOMENTALK_SPARK_MODEL", "muse-spark-1.3"),
        wonder_model=os.environ.get("MOMENTALK_WONDER_MODEL", "muse-wonder-1.0"),
        image_model=os.environ.get("MOMENTALK_IMAGE_MODEL", "muse-image-1.0"),
        voice_model=os.environ.get("MOMENTALK_VOICE_MODEL", "muse-voice-transcribe-1.0"),
        sam_model=os.environ.get("MOMENTALK_SAM_MODEL", "sam-3.1"),
    )


settings = load_settings()
