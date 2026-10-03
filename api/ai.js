export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: 'OPENAI_API_KEY is missing.'
    });
  }

  const prompt = req.body?.prompt;
  const webSearch = req.body?.webSearch === true;

  if (!prompt) {
    return res.status(400).json({
      ok: false,
      error: 'Prompt is required.'
    });
  }

  try {
    const payload = {
      model: webSearch
        ? (process.env.OPENAI_WEB_MODEL || 'gpt-5.5')
        : (process.env.OPENAI_MODEL || 'gpt-6-luna'),

      input: prompt,

      /*
       * Much smaller output = faster response.
       */
      max_output_tokens: webSearch ? 3200 : 5000
    };

    if (webSearch) {
      payload.tools = [
        {
          type: 'web_search',

          /*
           * LOW = faster search.
           */
          search_context_size: 'low',

          /*
           * Must use current/live internet.
           */
          external_web_access: true
        }
      ];

      /*
       * Panel 3 explicitly means "research from internet".
       */
      payload.tool_choice = 'required';

      payload.include = [
        'web_search_call.action.sources'
      ];
    }

    const response = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },

        body: JSON.stringify(payload)
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        ok: false,
        error: 'Invalid response from AI service.'
      });
    }

    if (!response.ok) {
      console.error(
        'OpenAI error:',
        response.status,
        data
      );

      return res.status(502).json({
        ok: false,
        error:
          data?.error?.message ||
          `AI request failed (${response.status}).`
      });
    }

    /*
     * Responses API normally exposes output_text.
     */
    let text = '';

    if (typeof data.output_text === 'string') {
      text = data.output_text.trim();
    }

    /*
     * Fallback extraction.
     */
    if (!text && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content)) continue;

        for (const c of item.content) {
          if (
            typeof c.text === 'string' &&
            c.text.trim()
          ) {
            text += c.text;
          }
        }
      }

      text = text.trim();
    }

    if (!text) {
      return res.status(502).json({
        ok: false,
        error: 'AI returned no text.'
      });
    }

    /*
     * Collect source URLs.
     */
    const sources = [];

    if (Array.isArray(data.output)) {
      for (const item of data.output) {

        if (Array.isArray(item?.action?.sources)) {
          for (const s of item.action.sources) {
            if (
              s?.url &&
              !sources.some(x => x.url === s.url)
            ) {
              sources.push({
                title: s.title || s.url,
                url: s.url
              });
            }
          }
        }

        if (!Array.isArray(item.content)) continue;

        for (const c of item.content) {

          if (!Array.isArray(c.annotations)) continue;

          for (const a of c.annotations) {

            if (a.type !== 'url_citation') continue;

            const url =
              a.url ||
              a.url_citation?.url;

            const title =
              a.title ||
              a.url_citation?.title ||
              url;

            if (
              url &&
              !sources.some(x => x.url === url)
            ) {
              sources.push({
                title,
                url
              });
            }
          }
        }
      }
    }

    /*
     * Remove markdown code fences.
     */
    let cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed = null;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      /*
       * Recover JSON object if model added
       * a tiny amount of extra text.
       */
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');

      if (start !== -1 && end > start) {
        try {
          parsed = JSON.parse(
            cleaned.slice(start, end + 1)
          );
        } catch {}
      }
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      console.error(
        'Invalid JSON from model:',
        cleaned.slice(0, 3000)
      );

      return res.status(502).json({
        ok: false,
        error: 'AI returned invalid JSON.'
      });
    }

    return res.status(200).json({
      ok: true,
      data: parsed,
      sources: sources.slice(0, 10)
    });

  } catch (error) {

    console.error(
      'CareerMitra API error:',
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        'AI service error.'
    });
  }
}
