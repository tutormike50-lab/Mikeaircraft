const { issueSignedToken, presignUrl } = require('@vercel/blob');

const VERSION = '0.4';
const MODEL = 'openai/gpt-5.4-mini';

function blobAuthOptions() {
  const options = {};
  if (process.env.VERCEL_OIDC_TOKEN) options.oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (process.env.BLOB_STORE_ID) options.storeId = process.env.BLOB_STORE_ID;
  return options;
}

function normalizeReg(value) {
  const registration = String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
  return registration.replace(/^40-/, '4O-');
}

function plausible(value) {
  return /^[A-Z0-9]{1,3}-[A-Z0-9]{2,6}$/.test(value) ||
    /^[A-Z]{1,3}[A-Z0-9]{3,5}$/.test(value);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function gatewayErrorDetail(raw) {
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.error?.message || parsed.message || raw).slice(0, 300);
  } catch {
    return String(raw || 'Unknown AI Gateway error').slice(0, 300);
  }
}

async function callGateway(gatewayKey, payload) {
  let lastStatus = 0;
  let lastRaw = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + gatewayKey,
          'Content-Type': 'application/json',
          'X-Vercel-AI-Gateway-User': 'mikeaircraft-photo-librarian'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      lastStatus = response.status;
      lastRaw = await response.text();
      if (response.ok) return { response, raw: lastRaw, attempt };

      const retryable = response.status === 408 || response.status === 409 ||
        response.status === 429 || response.status >= 500;
      console.error('Photo vision gateway attempt failed', JSON.stringify({
        attempt,
        status: response.status,
        detail: gatewayErrorDetail(lastRaw)
      }));

      if (!retryable || attempt === 3) break;
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 12000)
        : attempt * 2500);
    } catch (error) {
      lastStatus = error?.name === 'AbortError' ? 504 : 0;
      lastRaw = error?.name === 'AbortError' ? 'AI Gateway request timed out' : error.message;
      console.error('Photo vision gateway network attempt failed', JSON.stringify({
        attempt,
        detail: lastRaw
      }));
      if (attempt === 3) break;
      await sleep(attempt * 2500);
    } finally {
      clearTimeout(timeout);
    }
  }

  const error = new Error(gatewayErrorDetail(lastRaw));
  error.status = lastStatus;
  throw error;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_KEY;

    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        service: 'MikeAircraft Visual Registration Reader',
        version: VERSION,
        ready: !!gatewayKey,
        blobReady: !!process.env.VERCEL_OIDC_TOKEN,
        model: MODEL,
        imageDelivery: 'validated-inline-jpeg',
        retries: 3
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'POST required' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const pathname = String(body.pathname || '');

    if (!pathname.startsWith('photo-library/') || !/[.](jpg|jpeg|png|webp)$/i.test(pathname)) {
      return res.status(400).json({ ok: false, error: 'Invalid photo' });
    }

    if (!gatewayKey) {
      return res.status(503).json({
        ok: false,
        ready: false,
        error: 'Vision provider is not configured yet.'
      });
    }

    const token = await issueSignedToken({
      pathname,
      operations: ['get'],
      validUntil: Date.now() + 10 * 60 * 1000,
      ...blobAuthOptions()
    });

    const { presignedUrl } = await presignUrl(token, {
      operation: 'get',
      pathname,
      access: 'private',
      validUntil: Date.now() + 8 * 60 * 1000,
      useCache: false
    });

    const imageResponse = await fetch(presignedUrl);
    if (!imageResponse.ok) {
      throw new Error('Private photo could not be read (HTTP ' + imageResponse.status + ')');
    }

    const contentType = String(imageResponse.headers.get('content-type') || 'image/jpeg')
      .split(';')[0].toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
      throw new Error('Private photo returned an invalid content type');
    }

    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!imageBytes.length) throw new Error('Private photo was empty');
    if (imageBytes.length > 10 * 1024 * 1024) {
      throw new Error('Private photo is too large for visual reading');
    }

    const imageDataUrl = 'data:' + contentType + ';base64,' + imageBytes.toString('base64');
    const prompt = [
      'You are a conservative aircraft-registration OCR reader for a private photo catalogue.',
      'Inspect the actual image pixels at full detail. Concentrate on the rear fuselage, tail, nose gear doors and under-wing registration areas.',
      'Read only a registration that is visibly painted on this aircraft. Never infer or guess it from airline, livery, route or aircraft type.',\n      'Distinguish letters from digits carefully. Montenegro registrations begin 4O- with the letter O, never 40- with zero.',
      'Return JSON only with keys registration, confidence, visibleText, airlineHint, aircraftTypeHint, reasoning.',
      'confidence must be a number from 0 to 1.',
      'If the registration is absent, too small, blurred, partly hidden, or even one character is uncertain, set registration to null and explain exactly what text or obstruction you could see.'
    ].join(' ');

    const payload = {
      model: MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
        ]
      }],
      response_format: { type: 'json_object' }
    };

    let gateway;
    try {
      gateway = await callGateway(gatewayKey, payload);
    } catch (error) {
      console.error('Photo vision gateway exhausted retries', JSON.stringify({
        pathname,
        status: error.status || 0,
        detail: error.message
      }));
      return res.status(502).json({
        ok: false,
        error: 'Vision service temporarily unavailable',
        upstreamStatus: error.status || null,
        detail: error.message,
        retryable: true
      });
    }

    let outer;
    try {
      outer = JSON.parse(gateway.raw);
    } catch {
      console.error('Photo vision invalid outer JSON', gateway.raw.slice(0, 500));
      return res.status(502).json({
        ok: false,
        error: 'Vision service returned invalid JSON',
        retryable: true
      });
    }

    const content = outer.choices?.[0]?.message?.content || '';
    let result = {};
    try {
      result = JSON.parse(content);
    } catch {
      const match = String(content).match(/\{[\s\S]*\}/);
      if (match) {
        try { result = JSON.parse(match[0]); } catch {}
      }
    }

    const registration = normalizeReg(result.registration);
    const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
    const accepted = registration && plausible(registration) && confidence >= 0.82;

    console.log('Photo vision result', JSON.stringify({
      pathname,
      imageBytes: imageBytes.length,
      registration: registration || null,
      confidence,
      accepted,
      attempt: gateway.attempt,
      visibleText: result.visibleText || null
    }));

    return res.status(200).json({
      ok: true,
      service: 'MikeAircraft Visual Registration Reader',
      version: VERSION,
      pathname,
      registration: accepted ? registration : null,
      candidate: registration || null,
      confidence,
      status: accepted ? 'PROBABLE' : 'UNKNOWN',
      visibleText: result.visibleText || null,
      airlineHint: result.airlineHint || null,
      aircraftTypeHint: result.aircraftTypeHint || null,
      reasoning: result.reasoning || null,
      model: MODEL,
      imageDelivery: 'validated-inline-jpeg',
      gatewayAttempt: gateway.attempt,
      rule: 'Visual AI never marks CONFIRMED automatically.'
    });
  } catch (error) {
    console.error('Photo vision error', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
