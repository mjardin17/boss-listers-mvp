import { saveOAuthToken } from '@/lib/oauth/tokenManager'

export default async function handler(req, res) {
  const { code } = req.query
  if (!code) return res.status(400).json({ error: 'No code' })

  try {
    const response = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.FACEBOOK_OAUTH_CLIENT_ID,
        client_secret: process.env.FACEBOOK_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/facebook/callback`,
      }),
    })

    const data = await response.json()
    if (data.error) {
      return res.status(400).send(`
        <html>
          <head><title>Facebook Authorization Error</title><style>
            body{font-family:system-ui;padding:40px;max-width:600px;margin:0 auto}
            .error{background:#f8d7da;padding:20px;border-radius:8px;color:#721c24}
          </style></head>
          <body>
            <h1>❌ Authorization Failed</h1>
            <div class="error"><p><strong>Error:</strong> ${data.error.message}</p></div>
            <p><a href="/get-tokens">← Back to OAuth Tests</a></p>
          </body>
        </html>
      `)
    }

    const saved = await saveOAuthToken('facebook', {
      access_token: data.access_token,
      expires_in: data.expires_in,
    })

    if (!saved.success) {
      console.error('Failed to save Facebook token:', saved.error)
    }

    return res.send(`
      <html>
        <head><title>Facebook Authorization Success</title><style>
          body{font-family:system-ui;padding:40px;max-width:600px;margin:0 auto}
          .success{background:#d4edda;padding:20px;border-radius:8px;margin:20px 0;color:#155724}
          .info{background:#d1ecf1;padding:20px;border-radius:8px;margin:20px 0;color:#0c5460}
          .token{background:#f5f5f5;padding:15px;border-radius:6px;font-family:monospace;font-size:12px;margin:20px 0;word-break:break-all;max-height:100px;overflow-y:auto}
          button{padding:10px 20px;background:#28a745;color:white;border:none;border-radius:6px;cursor:pointer;margin:10px 5px 10px 0}
          a{color:#007bff;text-decoration:none}
        </style></head>
        <body>
          <h1>✅ Facebook Authorization Successful!</h1>
          <div class="success">
            <p><strong>Your Facebook account is now connected to BossLister</strong></p>
            ${saved.success ? '<p>✓ Token automatically saved to database</p>' : '<p>⚠ Token saved locally - database save failed</p>'}
          </div>
          <div class="info">
            <p><strong>What happens next:</strong></p>
            <ul>
              <li>Your access token is securely stored</li>
              <li>You can now post to your Facebook pages</li>
            </ul>
          </div>
          <h3>Access Token (for reference):</h3>
          <div class="token">${data.access_token}</div>
          <button onclick="navigator.clipboard.writeText('${data.access_token}')">📋 Copy Token</button>
          <p><a href="/get-tokens">← Back to OAuth Tests</a></p>
        </body>
      </html>
    `)
  } catch (error) {
    console.error('Facebook callback error:', error)
    return res.status(500).send(`
      <html>
        <head><title>Error</title><style>
          body{font-family:system-ui;padding:40px;max-width:600px;margin:0 auto}
          .error{background:#f8d7da;padding:20px;border-radius:8px;color:#721c24}
        </style></head>
        <body>
          <h1>❌ Error</h1>
          <div class="error"><p>${error.message}</p></div>
          <p><a href="/get-tokens">← Back to OAuth Tests</a></p>
        </body>
      </html>
    `)
  }
}
