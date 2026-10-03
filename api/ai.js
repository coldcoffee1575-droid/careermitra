export const maxDuration = 10;

/* =========================================================
   CAREERMITRA — FREE AI + FREE WEB RESEARCH API
   Provider: OpenRouter free models
   Web research: public Bing RSS search
   ========================================================= */


/* =========================
   TEXT CLEANING
   ========================= */

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}


/* =========================
   EXTRACT CAREER NAME
   ========================= */

function extractCareer(prompt) {
  const text = String(prompt || "").trim();

  /*
    Examples this handles:

    Research the career of an orthopedic surgeon
    specializing in reverse shoulder replacement in India.

    Dream career: orthopedic surgeon

    Exact career: AI researcher

    Non-negotiable career: orthopedic surgeon...
  */

  const patterns = [

    // "career of XYZ in India"
    /career\s+of\s+(.+?)(?:\s+in\s+India|\s+in\s+india|[.!?]\s|$)/i,

    // "career of XYZ"
    /career\s+of\s+(.+?)(?:[.!?]\s|$)/i,

    // "dream career: XYZ"
    /dream\s+career\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i,

    // "exact career: XYZ"
    /exact\s+career\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i,

    // "non-negotiable: XYZ"
    /non[- ]negotiable\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i,

    // "career: XYZ"
    /career\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i,

    // "role: XYZ"
    /role\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i
  ];

  for (const regex of patterns) {
    const match = text.match(regex);

    if (match && match[1]) {
      let career = match[1].trim();

      career = career
        .replace(/^["“']/, "")
        .replace(/["”']$/, "")
        .replace(/[.,;]+$/, "")
        .trim();

      if (career.length > 2) {
        return career;
      }
    }
  }

  /*
    Fallback:
    Remove common instruction words so that even if
    the exact format changes, search still has a
    reasonable query.
  */

  let fallback = text
    .replace(
      /research\s+(the\s+)?career\s+(of\s+)?/i,
      ""
    )
    .replace(
      /return\s+(the\s+)?requested\s+career\s+research\s+json\.?/i,
      ""
    )
    .replace(
      /return\s+json\s+only\.?/i,
      ""
    )
    .trim();

  const indiaIndex = fallback
    .toLowerCase()
    .indexOf(" in india");

  if (indiaIndex > 0) {
    fallback = fallback.slice(0, indiaIndex);
  }

  return fallback.slice(0, 180).trim();
}


/* =========================
   FREE WEB SEARCH
   ========================= */

async function searchWeb(query) {
  const url =
    "https://www.bing.com/search?format=rss&q=" +
    encodeURIComponent(query);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CareerMitra/1.0)"
      }
    });

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();

    const items =
      xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

    const results = [];

    for (const item of items.slice(0, 5)) {

      const titleMatch =
        item.match(
          /<title>([\s\S]*?)<\/title>/i
        );

      const linkMatch =
        item.match(
          /<link>([\s\S]*?)<\/link>/i
        );

      const descriptionMatch =
        item.match(
          /<description>([\s\S]*?)<\/description>/i
        );

      const title = titleMatch
        ? cleanText(titleMatch[1])
        : "";

      const link = linkMatch
        ? cleanText(linkMatch[1])
        : "";

      const snippet =
        descriptionMatch
          ? cleanText(descriptionMatch[1])
          : "";

      if (
        title &&
        link &&
        /^https?:\/\//i.test(link)
      ) {
        results.push({
          title,
          url: link,
          snippet
        });
      }
    }

    return results;

  } catch {
    return [];
  }
}


/* =========================
   MODEL TEXT EXTRACTION
   ========================= */

function extractModelText(data) {
  if (!data) {
    return "";
  }

  // OpenAI-style output
  if (
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  // OpenRouter / OpenAI chat completions
  if (
    typeof data.choices?.[0]?.message?.content ===
      "string" &&
    data.choices[0].message.content.trim()
  ) {
    return data.choices[0].message.content.trim();
  }

  // Sometimes content is an array
  const content =
    data.choices?.[0]?.message?.content;

  if (Array.isArray(content)) {
    const text = content
      .map(part => {
        if (typeof part === "string") {
          return part;
        }

        return part?.text || "";
      })
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}


/* =========================
   JSON PARSER
   ========================= */

function parseJSON(text) {
  if (!text) {
    return null;
  }

  // Direct JSON
  try {
    return JSON.parse(text);
  } catch {}

  // Markdown JSON block
  const fenced =
    text.match(
      /```(?:json)?\s*([\s\S]*?)```/i
    );

  if (fenced) {
    try {
      return JSON.parse(
        fenced[1].trim()
      );
    } catch {}
  }

  // Find first JSON object
  const start =
    text.indexOf("{");

  const end =
    text.lastIndexOf("}");

  if (
    start !== -1 &&
    end !== -1 &&
    end > start
  ) {
    try {
      return JSON.parse(
        text.slice(start, end + 1)
      );
    } catch {}
  }

  return null;
}


/* =========================
   OPENROUTER FREE MODEL
   ========================= */

async function callAI(prompt) {

  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing in Vercel Environment Variables."
    );
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Authorization":
          `Bearer ${apiKey}`,

        "Content-Type":
          "application/json",

        "HTTP-Referer":
          "https://careermitra-zeta.vercel.app/",

        "X-Title":
          "CareerMitra"
      },

      body: JSON.stringify({

        /*
          Free model router.
          It automatically selects an available
          free model.
        */

        model:
          "openrouter/free",

        messages: [

          {
            role: "system",

            content:
              `
You are CareerMitra, an AI career research assistant.

Give factual, practical and balanced career information.

Never invent current salary figures,
demand statistics, job requirements,
or sources.

When internet discussion comes from
Reddit, forums or user reviews,
clearly mark it as anecdotal.

When asked for JSON,
return valid JSON only.
`
          },

          {
            role: "user",

            content: prompt
          }

        ],

        temperature: 0.2,

        max_tokens: 2500
      })
    }
  );

  const raw =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(raw);
  } catch {
    throw new Error(
      "OpenRouter returned an invalid response."
    );
  }

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
      `OpenRouter returned HTTP ${response.status}`
    );
  }

  const text =
    extractModelText(data);

  if (!text) {

    throw new Error(
      "OpenRouter returned an empty AI response. Please try again."
    );
  }

  return text;
}


/* =========================
   MAIN VERCEL FUNCTION
   ========================= */

export default async function handler(
  req,
  res
) {

  /* ---------- METHOD ---------- */

  if (req.method !== "POST") {

    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }


  try {

    /* ---------- PROMPT ---------- */

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


    /* ---------- WEB SEARCH FLAG ---------- */

    const webSearch =
      req.body?.webSearch === true;


    let finalPrompt =
      prompt;

    let sources = [];


    /* =====================================================
       LIVE WEB RESEARCH
       ===================================================== */

    if (webSearch) {

      const career =
        extractCareer(prompt);


      /*
        Multiple focused searches.

        This is important because one generic query
        can return poor results.
      */

      const queries = [

        `"${career}" India career salary`,

        `"${career}" India job requirements`,

        `"${career}" India career path`,

        `"${career}" India demand future`,

        `"${career}" Reddit experience`
      ];


      /* ---------- RUN SEARCHES ---------- */

      const searchResults =
        await Promise.all(
          queries.map(
            query =>
              searchWeb(query)
          )
        );


      /* ---------- REMOVE DUPLICATES ---------- */

      const seen =
        new Set();

      for (
        const result
        of searchResults.flat()
      ) {

        if (
          result?.url &&
          !seen.has(result.url)
        ) {

          seen.add(result.url);

          sources.push(result);
        }
      }


      /* ---------- LIMIT SOURCES ---------- */

      sources =
        sources.slice(0, 15);


      /* ---------- FORMAT SOURCES ---------- */

      const researchText =
        sources.length > 0

          ? sources
              .map(
                (source, index) =>
                  `
[SOURCE ${index + 1}]

Title:
${source.title}

URL:
${source.url}

Information:
${source.snippet}
`
              )
              .join("\n")

          : `
No external search results
were retrieved.
`;


      /* ===================================================
         CAREER RESEARCH PROMPT
         =================================================== */

      finalPrompt = `

You are researching this EXACT career:

${career}


USER REQUEST:

${prompt}


LIVE INTERNET SEARCH RESULTS:

${researchText}


Now create a factual career research report.


RETURN ONLY VALID JSON.

Use exactly this structure:

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


IMPORTANT RULES:

1. Focus on the EXACT career above.

2. Use the supplied internet results
   wherever they provide relevant evidence.

3. Do NOT invent salary numbers.

4. If exact salary information is unavailable,
   say:
   "Exact salary data unavailable in the retrieved sources."

5. Do NOT invent demand statistics.

6. Reddit, forums and personal reviews
   are anecdotal evidence.
   Label them as anecdotal.

7. Do NOT claim anecdotal discussion
   represents the whole profession.

8. sources[] must contain actual URLs
   from the supplied search results.

9. Keep the report concise but useful.

10. Return JSON only.

`;
    }


    /* ---------- CALL AI ---------- */

    const modelText =
      await callAI(finalPrompt);


    /* ---------- PARSE JSON ---------- */

    const parsed =
      parseJSON(modelText);


    /* ---------- SUCCESS ---------- */

    return res.status(200).json({

      ok: true,

      data:
        parsed || {
          text: modelText
        },

      sources
    });


  } catch (error) {

    /* ---------- ERROR ---------- */

    return res.status(502).json({

      ok: false,

      error:
        error?.message ||
        "Unknown server error"
    });
  }
}
