"""The single place where Momentalk talks to the Meta Model API.

Request shapes follow docs/API_NOTES.md (official dev.meta.ai docs). Every call
passes through the CostLedger so a bug cannot drain the credit.
"""

from __future__ import annotations

import asyncio
import base64
import json
from typing import Any

import httpx

from .config import settings
from .cost import PRICES, CostLedger, llm_cost

ledger = CostLedger(settings.data_dir / "cost_ledger.json", settings.cost_cap_usd)

RETRY_STATUS = {429, 500, 502, 503, 504}


class MetaAPIError(RuntimeError):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"Meta API {status}: {body[:500]}")
        self.status = status
        self.body = body


def _client(timeout: float = 120) -> httpx.AsyncClient:
    if not settings.has_api_key:
        raise MetaAPIError(401, "MODEL_API_KEY is not set")
    return httpx.AsyncClient(
        base_url=settings.meta_base_url,
        headers={"Authorization": f"Bearer {settings.model_api_key}"},
        timeout=timeout,
    )


def language_model() -> dict[str, str]:
    """The model that handles language and vision reasoning (shown in the UI per step)."""
    return {"id": settings.spark_model, "name": "Muse Spark 1.3"}


async def _post_json(path: str, body: dict, timeout: float = 120) -> dict:
    ledger.check()
    delay = 1.0
    async with _client(timeout) as client:
        for attempt in range(4):
            resp = await client.post(path, json=body)
            if resp.status_code in RETRY_STATUS and attempt < 3:
                retry_after = resp.headers.get("retry-after")
                await asyncio.sleep(float(retry_after) if retry_after and retry_after.isdigit() else delay)
                delay *= 2
                continue
            if resp.status_code >= 400:
                raise MetaAPIError(resp.status_code, resp.text)
            return resp.json()
    raise MetaAPIError(599, "retries exhausted")


def image_data_url(data: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64," + base64.b64encode(data).decode()


# ---------- Muse Spark / Muse Wonder (chat completions) ----------

def strict_schema(schema: Any) -> Any:
    """Meta strict JSON mode requires additionalProperties: false and every property required, on every object."""
    if isinstance(schema, dict):
        out = {k: strict_schema(v) for k, v in schema.items()}
        if out.get("type") == "object" and "properties" in out:
            out["additionalProperties"] = False
            out["required"] = list(out["properties"].keys())
        return out
    if isinstance(schema, list):
        return [strict_schema(v) for v in schema]
    return schema


async def chat(messages: list[dict], *, model: str | None = None, schema: dict | None = None,
               schema_name: str = "result", tools: list[dict] | None = None,
               reasoning_effort: str | None = "low", max_tokens: int = 4000) -> dict:
    model = model or settings.spark_model
    body: dict[str, Any] = {"model": model, "messages": messages, "max_completion_tokens": max_tokens}
    if schema:
        body["response_format"] = {"type": "json_schema",
                                   "json_schema": {"name": schema_name, "schema": strict_schema(schema), "strict": True}}
    if tools:
        body["tools"] = tools
    if reasoning_effort:
        body["reasoning_effort"] = reasoning_effort
    data = await _post_json("/chat/completions", body)
    usage = data.get("usage") or {}
    kind = "wonder" if "wonder" in model else "spark"
    ledger.record(kind, llm_cost(kind, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)))
    return data


DASHES = {"—": ", ", "–": "-", "‒": "-", "―": ", "}


def clean_text(value: Any) -> Any:
    """Project rule: no em or en dashes in anything we show. Model text is normalized here."""
    if isinstance(value, str):
        for dash, repl in DASHES.items():
            value = value.replace(" " + dash + " ", repl if repl != ", " else ", ").replace(dash, repl)
        return value.replace(" ,", ",")
    if isinstance(value, list):
        return [clean_text(v) for v in value]
    if isinstance(value, dict):
        return {k: clean_text(v) for k, v in value.items()}
    return value


async def chat_json(messages: list[dict], schema: dict, **kwargs: Any) -> dict:
    data = await chat(messages, schema=schema, **kwargs)
    content = data["choices"][0]["message"]["content"]
    return clean_text(json.loads(content))


# ---------- SAM 3.1 (responses, streamed text) ----------

async def _sam_stream(content: list[dict], metadata: dict | None = None, timeout: float = 180) -> str:
    ledger.check()
    body = {"model": settings.sam_model,
            "input": [{"type": "message", "role": "user", "content": content}],
            "stream": True,
            # one_bit is about 14x smaller than the default lossless coverage and decodes to the same 0/1 mask.
            "metadata": {"include_confidence": "true", "mask_encoding": "one_bit", **(metadata or {})}}
    chunks: list[str] = []
    async with _client(timeout) as client:
        async with client.stream("POST", "/responses", json=body) as resp:
            if resp.status_code >= 400:
                raise MetaAPIError(resp.status_code, (await resp.aread()).decode(errors="replace"))
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if not payload or payload == "[DONE]":
                    continue
                try:
                    event = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "response.output_text.delta":
                    chunks.append(event.get("delta", ""))
    return "".join(chunks)


async def sam_image(image: bytes, prompt: str, mime: str = "image/jpeg") -> str:
    """Segment one concept (or a box/point prompt string) in an image. Returns raw SAM text."""
    text = await _sam_stream([{"type": "input_text", "text": prompt},
                              {"type": "input_image", "image_url": image_data_url(image, mime)}])
    ledger.record("sam_image", PRICES["sam_per_image"])
    return text


async def upload_file(data: bytes, filename: str, mime: str) -> str:
    ledger.check()
    async with _client(300) as client:
        resp = await client.post("/files", data={"purpose": "user_data"}, files={"file": (filename, data, mime)})
        if resp.status_code >= 400:
            raise MetaAPIError(resp.status_code, resp.text)
        return resp.json()["id"]


async def sam_video(file_id: str, phrase: str, frame_count: int) -> str:
    text = await _sam_stream([{"type": "input_text", "text": phrase},
                              {"type": "input_video", "file_id": file_id}], timeout=600)
    ledger.record("sam_video", PRICES["sam_per_frame"] * max(frame_count, 50))
    return text


# ---------- Muse Voice Transcribe (file) ----------

async def transcribe_wav(wav: bytes, keywords: list[str] | None = None, language_bias: list[str] | None = None) -> dict:
    ledger.check()
    request: dict[str, Any] = {"mode": "PUSH_TO_TALK", "model": settings.voice_model, "audioEncoding": "WAV"}
    if keywords:
        request["keywords"] = keywords
    if language_bias:
        request["languageBias"] = language_bias
    async with _client(120) as client:
        resp = await client.post(
            "/asr/transcribe",
            files={"request": (None, json.dumps(request), "application/json"),
                   "audio": ("audio.wav", wav, "audio/wav")},
            headers={"Accept": "application/json"},
        )
        if resp.status_code >= 400:
            raise MetaAPIError(resp.status_code, resp.text)
        data = resp.json()
    ledger.record("voice", PRICES["voice_per_hour"] * data.get("audioDurationMs", 0) / 3_600_000)
    return data


# ---------- Muse Image ----------

async def image_generate(prompt: str, size: str = "1024x1024") -> bytes:
    data = await _post_json("/images/generations", {"model": settings.image_model, "prompt": prompt, "n": 1,
                                                    "size": size, "output_format": "png"}, timeout=180)
    ledger.record("image", PRICES["image_per_image"])
    return base64.b64decode(data["data"][0]["b64_json"])


async def image_edit(prompt: str, references: list[tuple[bytes, str]]) -> bytes:
    images = [{"image_url": image_data_url(data, mime)} for data, mime in references]
    data = await _post_json("/images/edits", {"model": settings.image_model, "prompt": prompt,
                                              "images": images, "n": 1, "output_format": "png"}, timeout=180)
    ledger.record("image", PRICES["image_per_image"])
    return base64.b64decode(data["data"][0]["b64_json"])
