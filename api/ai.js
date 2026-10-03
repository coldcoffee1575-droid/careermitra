export default async function handler(req, res) {
  // CORS / preflight
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

  // Safety limit
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
          max_output_tokens: 5000
        })
      }
    );

    const raw = await response.text();

    let data = null;

    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    // OpenAI provider error
    if (!response.ok) {
      console.error(
        'OpenAI API error:',
        response.status,
        data || raw
      );

      const providerMessage =
        data?.error?.message ||
        data?.message ||
        'AI provider request failed.';

      return res.status(502).json({
        ok: false,
        error: providerMessage
      });
    }

    // Responses API output
    const text =
      typeof data?.output_text === 'string'
        ? data.output_text.trim()
        : '';

    if (!text) {
      console.error('OpenAI returned no output_text:', data);

      return res.status(502).json({
        ok: false,
        error: 'AI returned no text.'
      });
    }

    // -----------------------------------------
    // ROBUST JSON CLEANING
    // -----------------------------------------

    let cleaned = text.trim();

    // Remove markdown fences
    cleaned = cleaned
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed = null;

    // First: direct JSON
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }

    // -----------------------------------------
    // If model added extra text around JSON,
    // find the first balanced JSON object.
    // -----------------------------------------

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
          } else if (ch === '}') {
            depth--;

            if (depth === 0) {
              const candidate = cleaned.slice(start, i + 1);

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

    // -----------------------------------------
    // Final validation
    // -----------------------------------------

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      console.error(
        'AI returned invalid JSON:',
        text.slice(0, 2000)
      );

      return res.status(502).json({
        ok: false,
        error: 'AI returned invalid JSON.'
      });
    }

    if (!Array.isArray(parsed.questions)) {
      console.error(
        'AI JSON missing questions:',
        parsed
      );

      return res.status(502).json({
        ok: false,
        error: 'AI response does not contain questions.'
      });
    }

    // -----------------------------------------
    // Return exactly what CareerMitra expects
    // -----------------------------------------

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
