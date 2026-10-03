export default async function handler(req, res) {
  // Simple health check
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      apiKeyConfigured: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-6-luna'
    });
  }

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

  const model = process.env.OPENAI_MODEL || 'gpt-6-luna';

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: 5000,
        store: false
      })
    });

    const raw = await response.text();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    if (!response.ok) {
      const providerError =
        data?.error?.message ||
        data?.error?.code ||
        raw ||
        'AI provider request failed.';

      console.error('OpenAI API error:', {
        status: response.status,
        error: providerError
      });

      return res.status(502).json({
        ok: false,
        error: providerError
      });
    }

    const text =
      typeof data?.output_text === 'string'
        ? data.output_text.trim()
        : '';

    if (!text) {
      console.error('OpenAI returned no output text:', data);

      return res.status(502).json({
        ok: false,
        error: 'AI returned no text.'
      });
    }

    // Remove accidental markdown JSON fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error(
        'AI returned invalid JSON:',
        text.slice(0, 2000)
      );

      return res.status(502).json({
        ok: false,
        error: 'AI returned invalid JSON.'
      });
    }

    return res.status(200).json({
      ok: true,
      data: parsed
    });

  } catch (err) {
    console.error('AI proxy error:', err);

    return res.status(500).json({
      ok: false,
      error: 'AI service error.'
    });
  }
}
