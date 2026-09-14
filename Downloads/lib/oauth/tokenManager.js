import { createClient } from '@supabase/supabase-js'

console.log('Supabase Init:', {
  url: process.env.SUPABASE_URL,
  keyExists: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  keyStart: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10)
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function saveOAuthToken(platform, tokens) {
  try {
    const { data, error } = await supabase
      .from('oauth_tokens')
      .upsert(
        {
          platform,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'platform' }
      )
      .select()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error(`Error saving ${platform} token:`, error.message)
    return { success: false, error: error.message }
  }
}

export async function getOAuthToken(platform) {
  try {
    const { data, error } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('platform', platform)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return { success: false, error: 'Token not found' }
      throw error
    }

    const now = new Date()
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null

    if (expiresAt && now >= expiresAt) {
      return { success: false, error: 'Token expired', needsRefresh: true, data }
    }

    return { success: true, data }
  } catch (error) {
    console.error(`Error retrieving ${platform} token:`, error.message)
    return { success: false, error: error.message }
  }
}

export async function refreshOAuthToken(platform) {
  const { data: token, error: getError } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('platform', platform)
    .single()

  if (getError || !token?.refresh_token) {
    return { success: false, error: 'No refresh token available' }
  }

  const refreshFunctions = {
    youtube: refreshGoogleToken,
    google: refreshGoogleToken,
    tiktok: refreshTikTokToken,
    twitter: refreshTwitterToken,
    amazon: refreshAmazonToken,
  }

  const refreshFn = refreshFunctions[platform]
  if (!refreshFn) {
    return { success: false, error: `No refresh implementation for ${platform}` }
  }

  try {
    const newTokens = await refreshFn(token.refresh_token)
    const saved = await saveOAuthToken(platform, newTokens)
    return saved
  } catch (error) {
    console.error(`Error refreshing ${platform} token:`, error.message)
    return { success: false, error: error.message }
  }
}

async function refreshGoogleToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_YOUTUBE_OAUTH_CLIENT_ID,
      client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()
  if (data.error) throw new Error(data.error_description || data.error)

  return data
}

async function refreshTikTokToken(refreshToken) {
  const response = await fetch('https://open.tiktokapis.com/v1/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.NEXT_PUBLIC_TIKTOK_OAUTH_CLIENT_ID,
      client_secret: process.env.TIKTOK_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await response.json()
  if (data.error) throw new Error(data.error)

  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_in: data.data.expires_in,
  }
}

async function refreshTwitterToken(refreshToken) {
  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_TWITTER_OAUTH_CLIENT_ID,
      client_secret: process.env.TWITTER_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await response.json()
  if (data.error) throw new Error(data.error)

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_in: data.expires_in,
  }
}

async function refreshAmazonToken(refreshToken) {
  const response = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.AMAZON_OAUTH_CLIENT_ID,
      client_secret: process.env.AMAZON_OAUTH_CLIENT_SECRET,
    }),
  })

  const data = await response.json()
  if (data.error) throw new Error(data.error)

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_in: data.expires_in,
  }
}
