const { issueSignedToken } = require('@vercel/blob');
const { handleUploadPresigned } = require('@vercel/blob/client');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const jsonResponse = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname, clientPayload) => {
        const safePath = String(pathname || '').replace(/[^a-zA-Z0-9._/-]/g, '_');
        if (!safePath.startsWith('photo-library/')) throw new Error('Invalid photo-library path');

        const token = await issueSignedToken({
          pathname: safePath,
          operations: ['put'],
          allowedContentTypes: ['image/jpeg', 'image/webp'],
          maximumSizeInBytes: 20 * 1024 * 1024,
          validUntil: Date.now() + 15 * 60 * 1000,
          oidcToken: process.env.VERCEL_OIDC_TOKEN,
          storeId: process.env.BLOB_STORE_ID
        });

        return {
          token,
          urlOptions: {
            allowedContentTypes: ['image/jpeg', 'image/webp'],
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: 60 * 60 * 24 * 30
          }
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('MikeAircraft Photo Library upload complete', {
          url: blob?.url,
          pathname: blob?.pathname
        });
      }
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('MikeAircraft photo upload error', error);
    return res.status(400).json({ ok: false, error: error.message || 'Presigned upload error' });
  }
};
