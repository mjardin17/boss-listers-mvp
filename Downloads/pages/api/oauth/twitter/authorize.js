export default function handler(req, res) {
  const clientId = process.env.NEXT_PUBLIC_TWITTER_OAUTH_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/oauth/twitter/callback`;

  const authUrl = `https://twitter.com/i/oauth2/authorize?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('tweet.write tweet.read users.read')}` +
    `&state=state` +
    `&code_challenge=challenge` +
    `&code_challenge_method=plain`;

  res.redirect(authUrl);
}
