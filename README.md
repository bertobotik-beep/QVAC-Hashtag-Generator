# QVAC Hashtag Generator

Enter a post topic or description and an on-device AI writes a list of relevant hashtags — no made-up "trending" tags, just topically relevant ones. No cloud call, no API key.

## Run

```bash
npm install
npm start
```

Then open http://localhost:31017

Requires Node.js >= 22.17 (see `engines` in `package.json`).

## QVAC SDK version

`@qvac/sdk` ^0.19.0 (see `package.json`).

## How it works

Built on [Tether's QVAC SDK](https://www.npmjs.com/package/@qvac/sdk) — all inference runs on-device, no cloud call, no API key.

1. `loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0 })` loads the model once at startup, before the HTTP server starts accepting requests.
2. Each `POST /api/hashtag` request calls `completion()` with a one-shot example baked into the chat history (a real user/assistant turn, not just prose instructions) and streams the reply token-by-token via `run.tokenStream`.
3. `unloadModel({ modelId })` releases the model on `SIGINT`/`SIGTERM`.

The response is passed through `generate()` in `src/hashtag.js`, which extracts `#tag` tokens, drops ones that are too short/long to be real (garbled model artifacts tend to be long mashed-together words), and then runs a deterministic grounding check: a hashtag is only kept if it shares a word/stem with the topic or is one of a small allowlist of generic-but-plausible category words (like `#foodie`, `#travel`). This is what stops the model from inventing an unrelated "trending" hashtag out of nowhere. If fewer than 3 grounded hashtags survive, a fallback built directly from the topic's own words is returned instead.

### Example

Input:

> My homemade sourdough bread turned out perfectly golden this morning.

Output:

```
#sourdough #homemadebread #baking #breadmaking #sourdoughbread #foodie #fromscratch #bakersofinstagram
```

This exact pair is also the one-shot example baked into the prompt (see `EXAMPLE_INPUT`/`EXAMPLE_OUTPUT` in `src/hashtag.js`), and the code explicitly filters out these tags if the model parrots them back for an unrelated topic.

## License

MIT
