export default function handler(req, res) {
  const clientId = process.env.AMAZON_OAUTH_CLIENT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/amazon/callback`
  const state = 'random_state_string'

  const authUrl = `https://www.amazon.com/ap/oa?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent('profile')}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`

  res.redirect(authUrl)
}
