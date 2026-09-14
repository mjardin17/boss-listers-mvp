export default function handler(req, res) {
  const clientId = process.env.NEXT_PUBLIC_YOUTUBE_OAUTH_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/oauth/youtube/callback`;

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube')}` +
    `&access_type=offline`;

  res.redirect(authUrl);
}
