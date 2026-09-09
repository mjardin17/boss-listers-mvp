export default function handler(req, res) {
  const clientId = process.env.NEXT_PUBLIC_TIKTOK_OAUTH_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/oauth/tiktok/callback`;

  const authUrl = `https://www.tiktok.com/v3/oauth/authorize?` +
    `client_key=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=user.info.basic,video.upload` +
    `&response_type=code` +
    `&state=random_state_string`;

  res.redirect(authUrl);
}
