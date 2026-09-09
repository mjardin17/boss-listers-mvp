import { getOAuthToken, refreshOAuthToken } from '@/lib/oauth/tokenManager'

export default async function handler(req, res) {
  const { platform } = req.query

  if (!platform) {
    return res.status(400).json({
      error: 'Platform required',
      platforms: ['youtube', 'tiktok', 'twitter', 'instagram', 'facebook'],
    })
  }

  try {
    let tokenData = await getOAuthToken(platform)

    if (!tokenData.success) {
      return res.status(404).json({
        platform,
        status: 'not_authorized',
        error: tokenData.error,
        action: `Visit /get-tokens to authorize ${platform}`,
      })
    }

    const now = new Date()
    const expiresAt = tokenData.data.expires_at
      ? new Date(tokenData.data.expires_at)
      : null
    const isExpired = expiresAt && now >= expiresAt

    if (isExpired) {
      const refreshResult = await refreshOAuthToken(platform)

      if (!refreshResult.success) {
        return res.status(401).json({
          platform,
          status: 'expired_refresh_failed',
          error: refreshResult.error,
          action: `Visit /get-tokens to re-authorize ${platform}`,
        })
      }

      tokenData = refreshResult
    }

    const secondsUntilExpiry = expiresAt
      ? Math.floor((expiresAt - now) / 1000)
      : null

    return res.json({
      platform,
      status: isExpired ? 'refreshed' : 'active',
      authorized: true,
      expiresAt: tokenData.data.expires_at,
      secondsUntilExpiry,
      lastUpdated: tokenData.data.updated_at,
      hasRefreshToken: !!tokenData.data.refresh_token,
      message:
        isExpired
          ? 'Token was expired and has been refreshed'
          : 'Token is valid',
    })
  } catch (error) {
    console.error(`Error checking ${platform} token status:`, error)
    return res.status(500).json({
      error: error.message,
      platform,
    })
  }
}
