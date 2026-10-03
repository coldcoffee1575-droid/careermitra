export const maxDuration = 10;

/* =========================================================
   CAREERMITRA
   FREE AI + FREE WEB RESEARCH
   OpenRouter Free Model
   Public Bing RSS Search
   ========================================================= */


/* =========================================================
   TEXT CLEANING
   ========================================================= */

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


/* =========================================================
   CAREER EXTRACTION
   ========================================================= */

function extractCareer(prompt) {
  const text = String(prompt || "").trim();

  const patterns = [

    /career\s+of\s+(.+?)(?:\s+in\s+India|\s+in\s+india|[.!?]\s|$)/i,

    /career\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i,

    /dream\s+career\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i,

    /exact\s+career\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i,

    /non[- ]negotiable\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i,

    /role\s*:\s*["“']?(.+?)["”']?(?:\n|$)/i
  ];

  for (const regex of patterns) {

    const match = text.match(regex);

    if (match?.[1]) {

      let career = match[1]
        .trim()
        .replace(/^["“']/, "")
        .replace(/["”']$/, "")
        .replace(/[.,;]+$/, "")
        .trim();

      if (career.length > 2) {
        return career;
      }
    }
  }


  /* Fallback */

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


  const indiaIndex =
    fallback.toLowerCase().indexOf(" in india");

  if (indiaIndex > 0) {
    fallback =
      fallback.slice(0, indiaIndex);
  }

  return fallback.slice(0, 180).trim();
}


/* =========================================================
   SEARCH RESULT RELEVANCE
   ========================================================= */

function isBadResult(result) {

  const text = (
    `${result.title} ${result.url} ${result.snippet}`
  ).toLowerCase();


  const badDomains = [

    "merriam-webster.com",
    "dictionary.cambridge.org",
    "wiktionary.org",
    "dictionary.com",
    "thesaurus.com",
    "wordnik.com",
    "collinsdictionary.com",
    "yourdictionary.com"
  ];


  for (const domain of badDomains) {

    if (text.includes(domain)) {
      return true;
    }
  }


  const badWords = [

    "dictionary definition",
    "meaning of",
    "definition of",
    "pronunciation",
    "synonyms",
    "antonyms"
  ];


  let badScore = 0;

  for (const word of badWords) {

    if (text.includes(word)) {
      badScore++;
    }
  }


  return badScore >= 2;
}


/* =========================================================
   WEB SEARCH
   ========================================================= */

async function searchWeb(query) {

  const url =
    "https://www.bing.com/search?format=rss&q=" +
    encodeURIComponent(query);


  try {

    const response = await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CareerMitra/1.0)"
        }
      }
    );


    if (!response.ok) {
      return [];
    }


    const xml =
      await response.text();


    const items =
      xml.match(
        /<item>[\s\S]*?<\/item>/gi
      ) || [];


    const results = [];


    for (
      const item
      of items.slice(0, 8)
    ) {

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


      const title =
        titleMatch
          ? cleanText(titleMatch[1])
          : "";


      const link =
        linkMatch
          ? cleanText(linkMatch[1])
          : "";


      const snippet =
        descriptionMatch
          ? cleanText(
              descriptionMatch[1]
            )
          : "";


      if (
        title &&
        link &&
        /^https?:\/\//i.test(link)
      ) {

        const result = {
          title,
          url: link,
          snippet
        };


        if (!isBadResult(result)) {
          results.push(result);
        }
      }
    }


    return results;

  } catch {

    return [];
  }
}


/* =========================================================
   DOMAIN PRIORITY
   ========================================================= */

function sourcePriority(url) {

  const value =
    String(url || "").toLowerCase();


  /*
    Higher priority = better source
  */

  if (
    value.includes(".gov.in") ||
    value.includes(".gov")
  ) {
    return 100;
  }


  if (
    value.includes("nmc.org.in")
  ) {
    return 98;
  }


  if (
    value.includes("who.int")
  ) {
    return 95;
  }


  if (
    value.includes("aaos.org")
  ) {
    return 94;
  }


  if (
    value.includes("ncbi.nlm.nih.gov")
  ) {
    return 93;
  }


  if (
    value.includes("pubmed.ncbi.nlm.nih.gov")
  ) {
    return 92;
  }


  if (
    value.includes("mayoclinic.org")
  ) {
    return 90;
  }


  if (
    value.includes("clevelandclinic.org")
  ) {
    return 90;
  }


  if (
    value.includes("apollohospitals.com")
  ) {
    return 82;
  }


  if (
    value.includes("fortishealthcare.com")
  ) {
    return 82;
  }


  if (
    value.includes("manipalhospitals.com")
  ) {
    return 82;
  }


  if (
    value.includes("linkedin.com")
  ) {
    return 65;
  }


  if (
    value.includes("indeed.com")
  ) {
    return 65;
  }


  if (
    value.includes("glassdoor.")
  ) {
    return 62;
  }


  if (
    value.includes("reddit.com")
  ) {
    return 50;
  }


  return 40;
}


/* =========================================================
   MODEL TEXT EXTRACTION
   ========================================================= */

function extractModelText(data) {

  if (!data) {
    return "";
  }


  if (
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {

    return data.output_text.trim();
  }


  if (
    typeof data.choices?.[0]?.message?.content ===
      "string" &&
    data.choices[0].message.content.trim()
  ) {

    return data
      .choices[0]
      .message
      .content
      .trim();
  }


  const content =
    data.choices?.[0]?.message?.content;


  if (Array.isArray(content)) {

    const text =
      content
        .map(part => {

          if (
            typeof part === "string"
          ) {
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


/* =========================================================
   JSON PARSER
   ========================================================= */

function parseJSON(text) {

  if (!text) {
    return null;
  }


  try {
    return JSON.parse(text);
  } catch {}


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
        text.slice(
          start,
          end + 1
        )
      );

    } catch {}
  }


  return null;
}


/* =========================================================
   OPENROUTER FREE AI
   ========================================================= */

async function callAI(prompt) {

  const apiKey =
    process.env.OPENROUTER_API_KEY;


  if (!apiKey) {

    throw new Error(
      "OPENROUTER_API_KEY is missing in Vercel."
    );
  }


  const response =
    await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {

          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",

          "HTTP-Referer":
            "https://careermitra-zeta.vercel.app/",

          "X-Title":
            "CareerMitra"
        },

        body:
          JSON.stringify({

            model:
              "openrouter/free",

            messages: [

              {
                role: "system",

                content:
                  `
You are CareerMitra.

You are a factual career research assistant.

Use supplied internet evidence.

Never invent current salary figures,
market statistics,
requirements,
or sources.

If exact evidence is unavailable,
say so.

Reddit, forums and personal experiences
must be labelled anecdotal.

When JSON is requested,
return valid JSON only.
`
              },

              {
                role: "user",

                content:
                  prompt
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
      "OpenRouter returned invalid JSON."
    );
  }


  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
      `OpenRouter HTTP ${response.status}`
    );
  }


  const text =
    extractModelText(data);


  if (!text) {

    throw new Error(
      "OpenRouter returned an empty AI response."
    );
  }


  return text;
}


/* =========================================================
   MAIN API HANDLER
   ========================================================= */

export default async function handler(
  req,
  res
) {

  /* ---------- METHOD ---------- */

  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({

      ok: false,

      error:
        "Method not allowed"
    });
  }


  try {

    /* ---------- PROMPT ---------- */

    const prompt =
      typeof req.body?.prompt ===
        "string"

        ? req.body.prompt.trim()

        : "";


    if (!prompt) {

      return res.status(400).json({

        ok: false,

        error:
          "Missing prompt"
      });
    }


    /* ---------- SEARCH FLAG ---------- */

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
        IMPORTANT:
        These queries are intentionally
        career-specific.
      */

      const queries = [

        /* General career + India */

        `${career} India career salary jobs`,

        `${career} India qualifications career path`,

        `${career} India demand future jobs`,


        /* Specific profession */

        `${career} India professional requirements`,

        `${career} India training education`,

        `${career} India job opportunities`,


        /* Experience / anecdotal */

        `${career} Reddit experience career`
      ];


      /* ---------- RUN SEARCHES ---------- */

      const searchResults =
        await Promise.all(
          queries.map(
            query =>
              searchWeb(query)
          )
        );


      /* ---------- DEDUPLICATE ---------- */

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

          seen.add(
            result.url
          );

          sources.push(
            result
          );
        }
      }


      /* ---------- SORT BY QUALITY ---------- */

      sources.sort(
        (a, b) =>
          sourcePriority(b.url) -
          sourcePriority(a.url)
      );


      /* ---------- LIMIT ---------- */

      sources =
        sources.slice(
          0,
          15
        );


      /* ===================================================
         FORMAT RESEARCH MATERIAL
         =================================================== */

      const researchText =
        sources.length

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
No relevant web search results
were retrieved.
`;


      /* ===================================================
         CAREER RESEARCH PROMPT
         =================================================== */

      finalPrompt = `

You are CareerMitra's live career research engine.


EXACT CAREER:

${career}


USER REQUEST:

${prompt}


CURRENT INTERNET RESEARCH:

${researchText}


TASK:

Create a factual and practical report
about the EXACT career above.


RETURN ONLY VALID JSON:

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


RULES:


1. EXACT CAREER ONLY

Do not broaden the career into
a generic profession.


2. INTERNET EVIDENCE

Use the supplied search results
for current claims.


3. SALARY

Do not invent salary numbers.

If reliable salary evidence is absent,
say:

"Exact salary data unavailable
in the retrieved sources."


4. DEMAND

Do not invent percentages,
job counts or growth statistics.


5. CAREER PATH

Give a practical step-by-step path
appropriate for India when evidence
supports it.


6. ANECDOTAL INFORMATION

Reddit, forums and personal experiences
must be explicitly labelled anecdotal.


7. SOURCES

Only use URLs supplied in the
internet research.

Do not invent URLs.


8. QUALITY

Prefer government,
professional medical organizations,
universities,
peer-reviewed sources,
established hospitals,
and recognized employment sources
when available.


9. CONCISENESS

Keep every section useful and
reasonably concise.


10. JSON ONLY

Do not write markdown outside JSON.

`;
    }


    /* =====================================================
       CALL FREE AI
       ===================================================== */

    const modelText =
      await callAI(
        finalPrompt
      );


    /* =====================================================
       PARSE
       ===================================================== */

    const parsed =
      parseJSON(
        modelText
      );


    /* =====================================================
       RESPONSE
       ===================================================== */

    return res.status(200).json({

      ok: true,

      data:
        parsed || {
          text:
            modelText
        },

      sources
    });


  } catch (error) {

    return res.status(502).json({

      ok: false,

      error:
        error?.message ||
        "Unknown server error"
    });
  }
}
