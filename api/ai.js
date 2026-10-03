export const maxDuration = 10;

function cleanText(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeUrl(s) {
  try {
    const m = String(s || "").match(/uddg=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : s;
  } catch {
    return s;
  }
}

async function ddgSearch(query, limit = 3) {
  const url =
    "https://html.duckduckgo.com/html/?q=" +
    encodeURIComponent(query);

  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CareerMitra/1.0)"
    }
  });

  if (!r.ok) return [];

  const html = await r.text();
  const out = [];

  const re =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m;

  while ((m = re.exec(html)) && out.length < limit) {
    const title = cleanText(m[2]);
    const href = decodeUrl(m[1]);

    const tail = html.slice(
      re.lastIndex,
      re.lastIndex + 2500
    );

    const sm = tail.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/i
    );

    const snippet = sm ? cleanText(sm[1]) : "";

    if (
      title &&
      /^https?:\/\//i.test(href)
    ) {
      out.push({
        title,
        url: href,
        snippet
      });
    }
  }

  return out;
}

function extractCareer(prompt) {
  const p = String(prompt || "");

  const patterns = [
    /(?:non[- ]negotiable|dream career|exact career|career|profession|role)\s*(?:is|:)\s*["'“”]?([^"'“”\n]+)["'“”]?/i,
    /career\s*=\s*["'“”]?([^"'“”\n]+)["'“”]?/i
  ];

  for (const re of patterns) {
    const m = p.match(re);

    if (m?.[1]) {
      return m[1]
        .trim()
        .replace(/[.,;]+$/, "");
    }
  }

  return "";
}

function extractText(data) {
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

  const parts = [];

  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if (typeof c.text === "string") {
        parts.push(c.text);
      }
    }
  }

  return parts.join("\n");
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {}

  const fenced = String(text || "").match(
    /```(?:json)?\s*([\s\S]*?)```/i
  );

  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const m = String(text || "").match(
    /\{[\s\S]*\}/
  );

  if (!m) return null;

  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function callOpenRouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured in Vercel."
    );
  }

  const r = await fetch(
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
              "You are CareerMitra. Return valid JSON only when asked. Never invent current facts. Clearly mark anecdotal internet discussion themes as anecdotal."
          },

          {
            role: "user",
            content: prompt
          }
        ],

        max_tokens: 2200,

        temperature: 0.2
      })
    }
  );

  const raw = await r.text();

  let data = null;

  try {
    data = JSON.parse(raw);
  } catch {}

  if (!r.ok) {
    throw new Error(
      data?.error?.message ||
      `OpenRouter HTTP ${r.status}`
    );
  }

  return data;
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

    const sources = [];

    if (webSearch) {
      const career =
        extractCareer(prompt) ||
        prompt.slice(0, 140);

      const queries = [
        `"${career}" India salary demand career`,
        `"${career}" India experience review Reddit`
      ];

      const batches = await Promise.all(
        queries.map(q => ddgSearch(q, 4))
      );

      const seen = new Set();

      for (const item of batches.flat()) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          sources.push(item);
        }
      }

      finalPrompt = `${prompt}

LIVE WEB RESEARCH RESULTS:

${sources
  .slice(0, 8)
  .map(
    (x, i) =>
      `[${i + 1}] ${x.title}
URL: ${x.url}
Snippet: ${x.snippet}`
  )
  .join("\n\n")}

Research rules:

- Use the supplied web results for current claims.
- Do not invent salary numbers, demand statistics, or URLs.
- Clearly label Reddit/forum/review material as anecdotal.
- If evidence is missing, say that it is not established by the retrieved sources.
- Return JSON only.`;
    }

    const data =
      await callOpenRouter(finalPrompt);

    const text =
      extractText(data);

    const parsed =
      parseJson(text);

    if (parsed) {
      return res.status(200).json({
        ok: true,
        data: parsed,
        sources
      });
    }

    return res.status(200).json({
      ok: true,
      data: {
        text
      },
      sources
    });

  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: String(
        e?.message || e
      )
    });
  }
}
