// QVAC Hashtag Generator — core logic.
// completion() writes a list of hashtags grounded in the user's own
// topic. The one-shot example is real multi-turn history (not prose in
// the system prompt) so the small model is much less likely to parrot
// it verbatim. Deterministic grounding: every kept hashtag must share a
// word (or word-stem) with the topic, OR be one of a small set of
// generic-but-plausible category words the model tends to add — this
// stops the "made-up trending hashtag" failure mode called out in the
// spec (e.g. inventing #ForYouPage2026 out of nowhere).

import { completion } from "@qvac/sdk";

function looksUnusable(text) {
  if (!text || text.trim().length === 0) return true;
  if (text.length > 400) return true;
  const bad = ["i cannot", "i can't", "as an ai", "i'm not able", "i do not have", "i don't have"];
  const lower = text.toLowerCase();
  return bad.some((phrase) => lower.includes(phrase));
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "with", "to", "in", "on", "at", "my", "your",
  "is", "it", "this", "that", "i", "we", "our", "about", "from",
]);

function topicWords(topic) {
  return topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// A small allowlist of generic category words that are legitimately
// relevant hashtags even if they don't literally appear in the topic
// text (e.g. topic "my new golden retriever puppy" -> #dogsofinstagram,
// #puppylove are fair even though "puppy" is the stem match already;
// this list covers common umbrella tags across everyday topics).
const GENERIC_ALLOW = [
  "life", "love", "daily", "mood", "vibes", "inspo", "diy", "homemade", "handmade",
  "foodie", "fitness", "wellness", "travel", "photography", "art", "style", "fashion",
];

function words(str) {
  return str
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isGrounded(tag, tWords) {
  const tagWords = words(tag);
  if (tagWords.some((w) => GENERIC_ALLOW.includes(w))) return true;
  return tagWords.some((tw) =>
    tWords.some((w) => tw.includes(w) || w.includes(tw) || (tw.length > 4 && w.length > 4 && tw.slice(0, 5) === w.slice(0, 5)))
  );
}

const EXAMPLE_INPUT = "My homemade sourdough bread turned out perfectly golden this morning.";
const EXAMPLE_OUTPUT = "#sourdough #homemadebread #baking #breadmaking #sourdoughbread #foodie #fromscratch #bakersofinstagram";
const EXAMPLE_LOWER = EXAMPLE_OUTPUT.toLowerCase();

function fallback(topic) {
  const tWords = topicWords(topic).slice(0, 6);
  const tags = tWords.map((w) => `#${w}`);
  return tags.length ? tags : ["#trending"];
}

export async function generate(modelId, topic) {
  const run = completion({
    modelId,
    history: [
      {
        role: "system",
        content:
          "You write relevant hashtags for a social media post. Given a topic or " +
          "description, output 8-10 hashtags, space separated, each starting with #, " +
          "no spaces inside a hashtag. Every hashtag must be directly relevant to the " +
          "topic given — never invent a hashtag about being 'trending' or viral, and " +
          "never add a hashtag unrelated to the topic. Reply with ONLY the hashtags on " +
          "one line, no other text.",
      },
      { role: "user", content: `Topic: ${EXAMPLE_INPUT}` },
      { role: "assistant", content: EXAMPLE_OUTPUT },
      { role: "user", content: `Topic: ${topic}` },
    ],
    stream: true,
    completionOpts: { temperature: 0.6, maxTokens: 150 },
  });

  let text = "";
  for await (const token of run.tokenStream) text += token;

  const tWords = topicWords(topic);
  const isWaterTopic = tWords.some((w) => ["sourdough", "bread", "baking"].includes(w));

  let tags = (text.match(/#[a-zA-Z0-9_]+/g) || [])
    .map((t) => t.trim())
    // Cap length well below Instagram's own 30-char hashtag limit — past
    // ~20 chars a single mashed-together word tends to be a garbled
    // model artifact (e.g. "#homemadegoldencroissaintaking") rather than
    // a real hashtag, even though it may technically share a topic word.
    .filter((t) => t.length > 1 && t.length <= 20);

  // Guard against the model parroting the one-shot example verbatim.
  if (!isWaterTopic) {
    tags = tags.filter((t) => !EXAMPLE_LOWER.includes(t.toLowerCase()));
  }

  const deduped = [...new Set(tags.map((t) => t.toLowerCase()))].map(
    (lower) => tags.find((t) => t.toLowerCase() === lower)
  );

  const grounded = deduped.filter((t) => isGrounded(t, tWords));

  if (looksUnusable(text) || grounded.length < 3) {
    return { hashtags: fallback(topic) };
  }
  return { hashtags: grounded.slice(0, 10) };
}
