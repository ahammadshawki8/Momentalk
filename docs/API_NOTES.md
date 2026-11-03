# Meta Model API Notes

Source: official docs at https://dev.meta.ai/docs (models, pricing-rate-limits, speech-to-text, api-reference/voice/realtime, image-generation, media-segmentation, sam/segmenting, sam/reading-segmentation, structured-output, tool-calling, image-understanding, protocols/chat-completions). Read on 2026-11-03. Items marked UNVERIFIED must be confirmed in the Tier 0 spikes.

## Global
- Base URL: `https://api.meta.ai/v1`
- Auth header: `Authorization: Bearer $MODEL_API_KEY`
- Endpoints: `POST /responses`, `POST /chat/completions`, `POST /messages` (Anthropic compatible), `GET /models`, `POST /images/generations`, `POST /images/edits`, `POST /files` (purpose `user_data`), `POST /asr/transcribe`, `wss://api.meta.ai/v1/asr/realtime`
- Rate limits are per team. Retry 429 with exponential backoff and honor `Retry-After`.

## Model IDs
| Model | ID |
|---|---|
| Muse Spark 1.3 | `muse-spark-1.3` (do not use `-contributor`, it trains Meta products) |
| Muse Wonder | `muse-wonder-1.0` (preview) |
| Muse Image | `muse-image-1.0` |
| Muse Voice Transcribe | `muse-voice-transcribe-1.0` |
| SAM 3.1 | `sam-3.1` |

## Muse Spark (chat completions)
- Image part: `{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}`. Images only in user messages. Max 50 images, 50 MB inline.
- Structured output: `response_format: {"type":"json_schema","json_schema":{"name":"...","schema":{...},"strict":true}}`. Result is a JSON string in `choices[0].message.content`. No recursive schemas.
- Tools: OpenAI nested format. Only `tool_choice: "auto"`. `parallel_tool_calls` defaults true.
- Params: `max_completion_tokens`, `reasoning_effort` (minimal, low, medium, high, xhigh; `none` rejected). Unsupported: `n>1`, `stop`, `logprobs`, penalties.

## Muse Wonder
- Same endpoints as Spark, model `muse-wonder-1.0`. Responses API example: `{"model":"muse-wonder-1.0","reasoning":{"effort":"high"},"input":"..."}`.
- Input: text, image, video, audio, PDF. Output: text. Tool calling and structured output supported.

## SAM 3.1
- `POST /responses`, model `sam-3.1`, streaming recommended.
- Image request:
```json
{"model":"sam-3.1","input":[{"type":"message","role":"user","content":[
  {"type":"input_text","text":"glasses"},
  {"type":"input_image","image_url":"data:image/png;base64,..."}]}],"stream":true}
```
- Video: `{"type":"input_video","file_id":"..."}` after `POST /files` with `purpose=user_data`, or `video_url`. MP4/MOV, H.264/H.265/MPEG-4 only. Max 15,000 frames, 16 objects per frame, billed min 50 frames.
- **One concept per request.** "bus, bicycle" returns nothing.
- Box and point prompts are supported inside `input_text`:
  `<0f>1<|box;x1=444;y1=626;x2=675;y2=849;w=1800;h=1200|>,2<|point;x=1430;y=700;w=1800;h=1200|>` (prefix a point with `-` for a negative point).
- `metadata`: `mask_encoding` (`lossless` default, or `one_bit`), `include_confidence: "true"`, `propagation_direction` (both, forward, backward).
- Response: SSE `response.output_text.delta` events, one line per frame:
  `<Nf>id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..[;c=..]|><|mask;x=0;y=0[;c=..];data=H,W,ENC payload|>,id<...>`
  - `Nf` frame index (may skip, not always ascending). `id` is the track ID (stable while visible, not dense).
  - Boxes in source pixels, inclusive.
  - Mask payload is **base85** (not RLE, not PNG). ENC `~` lossless or `!` one_bit. `H,W` rows then columns. Decoded raster is row major 0/1 of length H*W.
  - Official decoder: `decodeMaskToRaster` (TypeScript). Python parser `meta-sam-parser` UNVERIFIED.
  - Zero matches means empty output.

## Muse Voice Transcribe
- File: `POST /asr/transcribe`, multipart parts `request` (JSON: `mode`, `model`, `audioEncoding:"WAV"`, optional `languageBias`, `keywords`) and `audio` (WAV mono 16-bit PCM, 16 or 24 kHz). Max 10 min, 32 MB.
  - Convert: `ffmpeg -i in.m4a -ac 1 -ar 24000 -c:a pcm_s16le -map_metadata -1 out.wav`
  - Response: `{"sessionId","transcript","audioDurationMs","turns":[{"turnId","startMs","endMs","transcript","speaker"}]}`
- Realtime: `wss://api.meta.ai/v1/asr/realtime`. HTTP auth header ignored. First text frame within 10 s:
```json
{"authorization":{"accessToken":"Bearer <MODEL_API_KEY>"},"audioEncoding":"PCM_16KHZ",
 "model":"muse-voice-transcribe-1.0","mode":"PUSH_TO_TALK","partialMode":"CUMULATIVE","emitAudioProgress":false}
```
  - Optional `languageBias` (array of language names), `keywords` (array). Useful: pass hotspot labels as `keywords`.
  - Wait for ack `{"sessionId":"..."}`, then send binary frames of raw s16le mono PCM, paced at real time (backlog over 5 s closes the socket).
  - End with text frame `{"type":"endStream"}`.
  - Server events: `speechStart`, `transcript` (`transcript`, `final`), `speechEnd`, `speechComplete`, `audioProgress`, `error`.
  - Close codes: 1000 normal, 1008 invalid or pacing, 1011 backend (retry), 1013 rate limited. Session max 60 min.

## Muse Image
- `POST /images/generations`: `model`, `prompt`, `n` (1 to 10), `size` ("WxH", aspect only), `response_format` (`b64_json` default or `url`), `output_format` (webp default, png, jpeg).
- `POST /images/edits` JSON form: `{"model":"muse-image-1.0","prompt":"...","images":[{"image_url":"data:image/webp;base64,..."}],"n":1}`. 1 to 10 references.
- Response: `{"data":[{"b64_json":"..."}],"output_format":"webp",...}`. Moderation returns 400.

## Pricing (USD)
| Model | Price |
|---|---|
| Muse Spark 1.3 | $1.25 in, $0.15 cached, $4.25 out per 1M tokens |
| Muse Wonder | $4.00 in, $0.20 cached, $20.00 out per 1M tokens |
| Muse Image | $0.01 per image |
| Voice Transcribe | $0.18 per hour |
| SAM 3.1 | $2.50 per 1K images, $0.20 per 1K video frames |

## Rate limits
Spark and Wonder 3,000 RPM and 4M TPM. SAM 3,000 RPM. Muse Image 150 RPM. Voice 256 concurrent streams.
