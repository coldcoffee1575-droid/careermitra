export const maxDuration = 10;

function cleanText(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchWeb(query) {
  const url =
    "https://www.bing.com/search?format=rss&q=" +
    encodeURIComponent(query);

  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 CareerMitra/1.0"
    }
  });

  if (!r.ok) {
    return [];
  }

  const xml = await r.text();

  const results = [];

  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const item of items.slice(0, 5)) {
    const title =
      item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";

    const link =
      item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "";

    const description =
      item.match(
        /<description>([\s\S]*?)<\/description>/i
      )?.[1] || "";

    if (title && link) {
      results.push({
        title: cleanText(title),
        url: cleanText(link),
        snippet: cleanText(description)
      });
    }
  }

  return results;
}

function extractCareer(prompt) {
  const text = String(prompt || "");

  const patterns = [
    /non[- ]negotiable[^:\n]*:\s*["']?([^"'\n]+)["']?/i,
    /dream career[^:\n]*:\s*["']?([^"'\n]+)["']?/i,
    /exact career[^:\n]*:\s*["']?([^"'\n]+)["']?/i,
    /career[^:\n]*:\s*["']?([^"'\n]+)["']?/i
  ];

  for (const regex of patterns) {
    const match = text.match(regex);

    if (match?.[1]) {
      return match[1]
        .trim()
        .replace(/[.,;]+$/, "");
    }
  }

  return text.slice(0, 150);
}

function extractModelText(data) {
  if (!data) return "";

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (
    typeof data.choices?.[0]?.message?.content ===
    "string"
  ) {
    return data.choices[0].message.content;
  }

  return "";
}

function parseJSON(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const match =
    text.match(/```json\s*([\s\S]*?)```/i);

  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }

  const objectMatch =
    text.match(/\{[\s\S]*\}/);

  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {}
  }

  return null;
}

async function callAI(prompt) {
  const key =
    process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is missing in Vercel."
    );
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          "https://careermitra-zeta.vercel.app/",
        "X-Title": "CareerMitra"
      },

      body: JSON.stringify({
        model: "openrouter/free",

        messages: [
          {
            role: "system",
            content:
              "You are CareerMitra. Give accurate career research. Use the supplied web research. Never invent facts. Return valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],

        temperature: 0.2,

        max_tokens: 2200
      })
    }
  );

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "Invalid response from OpenRouter."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `OpenRouter error ${response.status}`
    );
  }

  const text =
    extractModelText(data);

  if (!text) {
    throw new Error(
      "OpenRouter returned an empty response. Please retry."
    );
  }

  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const prompt =
      typeof req.body?.prompt === "string"
        ? req.body.prompt.trim()
        : "";

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "Missing prompt"
      });
    }

    const webSearch =
      req.body?.webSearch === true;

    let finalPrompt = prompt;
    let sources = [];

    if (webSearch) {
      const career =
        extractCareer(prompt);

      const queries = [
        `"${career}" India career salary demand`,
        `"${career}" India job requirements`,
        `"${career}" India career path`,
        `"${career}" Reddit experience`
      ];

      const searchResults =
        await Promise.all(
          queries.map(q => searchWeb(q))
        );

      const seen = new Set();

      for (const result of searchResults.flat()) {
        if (!seen.has(result.url)) {
          seen.add(result.url);
          sources.push(result);
        }
      }

      sources = sources.slice(0, 12);

      const researchText =
        sources.length
          ? sources
              .map(
                (s, i) =>
                  `[SOURCE ${i + 1}]
Title: ${s.title}
URL: ${s.url}
Information: ${s.snippet}`
              )
              .join("\n\n")
          : "No external search results were retrieved.";

      finalPrompt = `
You are researching this exact career:

${career}

User's original request:

${prompt}

CURRENT INTERNET SEARCH RESULTS:

${researchText}

Prepare a factual career research report.

Return ONLY valid JSON in this exact structure:

{
  "career": "",
  "what_it_involves": "",
  "pros": [],
  "cons": [],
  "earning_reality_india": "",
  "market_requirements": [],
  "demand": "",
  "growth_future": "",
  "step_by_step_path": [],
  "same_level_alternatives": [],
  "struggles_barriers": [],
  "rewards_beyond_money": [],
  "anecdotal_reviews": [],
  "sources": []
}

Rules:

1. Use current search results where relevant.
2. Do not invent salary figures.
3. If exact salary data is unavailable, say so.
4. Reddit/forum material must be labelled anecdotal.
5. Sources must contain actual URLs from the supplied results.
6. Keep answers concise but useful.
7. Do not make up sources.
`;
    }

    const text =
      await callAI(finalPrompt);

    const parsed =
      parseJSON(text);

    return res.status(200).json({
      ok: true,
      data:
        parsed || {
          text
        },
      sources
    });

  } catch (error) {
    return res.status(502).json({
      ok: false,
      error:
        error?.message ||
        "Unknown API error"
    });
  }
}
