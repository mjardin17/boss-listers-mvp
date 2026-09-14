import { getOAuthToken, refreshOAuthToken } from './tokenManager'

export async function getValidToken(platform) {
  try {
    let token = await getOAuthToken(platform)

    if (token.needsRefresh) {
      console.log(`Token for ${platform} expired, refreshing...`)
      token = await refreshOAuthToken(platform)
    }

    if (!token.success) {
      return {
        success: false,
        error: token.error || `No token available for ${platform}`,
        needsAuth: true,
      }
    }

    return {
      success: true,
      accessToken: token.data.access_token,
      expiresAt: token.data.expires_at,
    }
  } catch (error) {
    console.error(`Error getting token for ${platform}:`, error)
    return {
      success: false,
      error: error.message,
      needsAuth: true,
    }
  }
}

export function tokenExpiredError(platform) {
  return {
    success: false,
    error: `${platform} token expired. Please re-authorize at /get-tokens`,
    needsAuth: true,
  }
}

export function noTokenError(platform) {
  return {
    success: false,
    error: `No ${platform} token found. Please authorize at /get-tokens`,
    needsAuth: true,
  }
}
