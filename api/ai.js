export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  const prompt = req.body?.prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: 'A prompt is required.' });
  }

  // Keep accidental/abusive oversized requests from becoming expensive.
  if (prompt.length > 50000) {
    return res.status(413).json({ ok: false, error: 'Prompt is too large.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
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
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!response.ok) {
      console.error('OpenAI API error:', data || raw);
      return res.status(502).json({ ok: false, error: 'AI provider request failed.' });
    }

    const text = typeof data?.output_text === 'string' ? data.output_text.trim() : '';
    if (!text) {
      return res.status(502).json({ ok: false, error: 'AI returned no text.' });
    }

    // The existing CareerMitra code expects an object from aiJson().
    // Strip accidental markdown fences if a model adds them.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('AI returned non-JSON:', text.slice(0, 1000));
      return res.status(502).json({ ok: false, error: 'AI returned invalid JSON.' });
    }

    return res.status(200).json({ ok: true, data: parsed });
  } catch (err) {
    console.error('AI proxy error:', err);
    return res.status(500).json({ ok: false, error: 'AI service error.' });
  }
}
