const { handleUpload } = require('@vercel/blob/client');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const safePath = String(pathname || '').replace(/[^a-zA-Z0-9._/-]/g, '_');
        if (!safePath.startsWith('photo-library/')) {
          throw new Error('Invalid photo-library path');
        }
        let payload = {};
        try { payload = clientPayload ? JSON.parse(clientPayload) : {}; } catch {}
        return {
          allowedContentTypes: ['image/jpeg', 'image/webp'],
          maximumSizeInBytes: 20 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            sourceName: payload.sourceName || null,
            sourceModified: payload.sourceModified || null,
            burstId: payload.burstId || null,
            qualityScore: payload.qualityScore || null,
            airport: payload.airport || 'PRG',
            watermarked: true,
            publicDerivativeOnly: true
          })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('MikeAircraft Photo Library upload complete', {
          url: blob?.url,
          pathname: blob?.pathname,
          tokenPayload
        });
      }
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('MikeAircraft photo upload error', error);
    return res.status(400).json({ ok: false, error: error.message || 'Upload token error' });
  }
};
