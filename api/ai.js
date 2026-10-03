export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

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
      error: 'OPENAI_API_KEY is not configured on the server.'
    });
  }

  const prompt = req.body?.prompt;

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'A prompt is required.'
    });
  }

  if (prompt.length > 50000) {
    return res.status(413).json({
      ok: false,
      error: 'Prompt is too large.'
    });
  }

  try {
    const response = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },

        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-6-luna',

          input: prompt,

          max_output_tokens: 7000,

          /*
           * Live internet research.
           * The model can search current web information
           * before generating its answer.
           */
          tools: [
            {
              type: 'web_search'
            }
          ]
        })
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    /*
     * OpenAI API error
     */
    if (!response.ok) {
      console.error(
        'OpenAI API error:',
        response.status,
        data || raw
      );

      return res.status(502).json({
        ok: false,
        error:
          data?.error?.message ||
          data?.message ||
          'AI provider request failed.'
      });
    }

    /*
     * -----------------------------------------
     * Extract output text
     * -----------------------------------------
     */

    let text = '';

    // Normal Responses API shortcut
    if (typeof data?.output_text === 'string') {
      text = data.output_text.trim();
    }

    // Responses API output items
    if (!text && Array.isArray(data?.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item?.content)) continue;

        for (const content of item.content) {
          if (
            content?.type === 'output_text' &&
            typeof content?.text === 'string'
          ) {
            text += content.text;
          }
        }
      }

      text = text.trim();
    }

    // Extra fallback
    if (!text && Array.isArray(data?.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item?.content)) continue;

        for (const content of item.content) {
          if (typeof content?.text === 'string') {
            text += content.text;
          }
        }
      }

      text = text.trim();
    }

    if (!text) {
      console.error(
        'AI returned no usable text:',
        JSON.stringify(data).slice(0, 5000)
      );

      return res.status(502).json({
        ok: false,
        error: 'AI returned no text.'
      });
    }

    /*
     * -----------------------------------------
     * Clean markdown JSON fences
     * -----------------------------------------
     */

    let cleaned = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed = null;

    /*
     * First try direct JSON
     */
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }

    /*
     * -----------------------------------------
     * Recover JSON if model wrote text around it
     * -----------------------------------------
     */

    if (!parsed) {
      const start = cleaned.indexOf('{');

      if (start !== -1) {
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = start; i < cleaned.length; i++) {
          const ch = cleaned[i];

          if (escaped) {
            escaped = false;
            continue;
          }

          if (ch === '\\' && inString) {
            escaped = true;
            continue;
          }

          if (ch === '"') {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (ch === '{') {
            depth++;
          }

          if (ch === '}') {
            depth--;

            if (depth === 0) {
              const candidate = cleaned.slice(
                start,
                i + 1
              );

              try {
                parsed = JSON.parse(candidate);
              } catch {
                parsed = null;
              }

              break;
            }
          }
        }
      }
    }

    /*
     * -----------------------------------------
     * Validate JSON
     * -----------------------------------------
     */

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      console.error(
        'Invalid AI JSON:',
        text.slice(0, 3000)
      );

      return res.status(502).json({
        ok: false,
        error: 'AI returned invalid JSON.'
      });
    }

    /*
     * Test Zone response
     *
     * Existing CareerMitra expects:
     * { questions: [...] }
     *
     * Other AI features can return their
     * own JSON structure.
     */

    return res.status(200).json({
      ok: true,
      data: parsed
    });

  } catch (err) {
    console.error(
      'CareerMitra AI proxy error:',
      err
    );

    return res.status(500).json({
      ok: false,
      error: 'AI service error.'
    });
  }
}
