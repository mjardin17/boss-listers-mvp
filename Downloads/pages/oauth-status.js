'use client'

import { useState, useEffect } from 'react'

const PLATFORMS = ['youtube', 'tiktok', 'twitter', 'instagram', 'facebook']

export default function OAuthStatus() {
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAllTokens()
    const interval = setInterval(checkAllTokens, 30000)
    return () => clearInterval(interval)
  }, [])

  async function checkAllTokens() {
    const results = {}
    for (const platform of PLATFORMS) {
      try {
        const res = await fetch(`/api/oauth/status?platform=${platform}`)
        results[platform] = await res.json()
      } catch (error) {
        results[platform] = { error: error.message, platform }
      }
    }
    setStatuses(results)
    setLoading(false)
  }

  async function refreshToken(platform) {
    try {
      const res = await fetch(`/api/oauth/status?platform=${platform}`)
      const data = await res.json()
      setStatuses((prev) => ({ ...prev, [platform]: data }))
    } catch (error) {
      setStatuses((prev) => ({
        ...prev,
        [platform]: { error: error.message, platform },
      }))
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <h1>🔐 OAuth Token Status</h1>
        <p>Loading token statuses...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>🔐 OAuth Token Status Dashboard</h1>
        <p>Monitor and manage your connected accounts</p>
      </header>

      <div style={styles.grid}>
        {PLATFORMS.map((platform) => {
          const status = statuses[platform] || {}
          const isAuthorized = status.authorized
          const isExpired =
            status.expiresAt && new Date() >= new Date(status.expiresAt)
          const hoursUntilExpiry = status.secondsUntilExpiry
            ? Math.floor(status.secondsUntilExpiry / 3600)
            : null

          return (
            <div key={platform} style={styles.card(isAuthorized, isExpired)}>
              <div style={styles.cardHeader}>
                <h2 style={styles.platformName}>
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </h2>
                <div style={styles.badge(isAuthorized, isExpired)}>
                  {!isAuthorized
                    ? '❌ Not Authorized'
                    : isExpired
                      ? '⚠️ Expired'
                      : '✅ Active'}
                </div>
              </div>

              {isAuthorized && (
                <div style={styles.details}>
                  {hoursUntilExpiry !== null && (
                    <div>
                      <strong>Expires in:</strong> {hoursUntilExpiry} hours
                    </div>
                  )}
                  {status.lastUpdated && (
                    <div>
                      <strong>Last Updated:</strong>{' '}
                      {new Date(status.lastUpdated).toLocaleString()}
                    </div>
                  )}
                  <div>
                    <strong>Refresh Token:</strong>{' '}
                    {status.hasRefreshToken ? '✓ Available' : '✗ Not available'}
                  </div>
                  {status.message && (
                    <div style={styles.message}>{status.message}</div>
                  )}
                </div>
              )}

              {!isAuthorized && (
                <div style={styles.error}>{status.error}</div>
              )}

              <div style={styles.actions}>
                {isAuthorized && (
                  <button
                    onClick={() => refreshToken(platform)}
                    style={styles.button}
                  >
                    🔄 Refresh
                  </button>
                )}
                <a href="/get-tokens" style={styles.link}>
                  {isAuthorized ? '🔑 Re-authorize' : '🔗 Authorize'}
                </a>
              </div>
            </div>
          )
        })}
      </div>

      <section style={styles.section}>
        <h2>📋 What's Next?</h2>
        <ul>
          <li>
            <strong>YouTube:</strong> Click "Authorize" to connect your YouTube
            account
          </li>
          <li>
            <strong>TikTok:</strong> Click "Authorize" to connect your TikTok
            account
          </li>
          <li>
            <strong>Twitter/X:</strong> Click "Authorize" to connect your X
            account
          </li>
          <li>
            <strong>Instagram/Facebook:</strong> Requires manual setup (coming
            soon)
          </li>
        </ul>
      </section>

      <section style={styles.section}>
        <h2>🛡️ Security</h2>
        <ul>
          <li>Tokens are encrypted and stored securely in Supabase</li>
          <li>Tokens automatically refresh when expired</li>
          <li>No tokens are stored in .env or git</li>
          <li>Only service role can access tokens</li>
        </ul>
      </section>
    </div>
  )
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    marginBottom: '40px',
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
  },
  card: (isAuth, isExpired) => ({
    padding: '20px',
    borderRadius: '8px',
    border: `2px solid ${isAuth && !isExpired ? '#28a745' : isExpired ? '#ffc107' : '#dc3545'}`,
    backgroundColor: isAuth && !isExpired ? '#f0f8f0' : isExpired ? '#fff8e1' : '#fff5f5',
  }),
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  platformName: {
    margin: '0',
    fontSize: '18px',
  },
  badge: (isAuth, isExpired) => ({
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 'bold',
    backgroundColor: isAuth && !isExpired ? '#d4edda' : isExpired ? '#fff3cd' : '#f8d7da',
    color: isAuth && !isExpired ? '#155724' : isExpired ? '#856404' : '#721c24',
  }),
  details: {
    fontSize: '14px',
    color: '#333',
    marginBottom: '15px',
    lineHeight: '1.8',
  },
  error: {
    padding: '10px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '4px',
    marginBottom: '15px',
    fontSize: '14px',
  },
  message: {
    marginTop: '10px',
    padding: '10px',
    backgroundColor: '#d1ecf1',
    color: '#0c5460',
    borderRadius: '4px',
  },
  actions: {
    display: 'flex',
    gap: '10px',
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  link: {
    padding: '8px 16px',
    backgroundColor: '#6c757d',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '4px',
    textAlign: 'center',
    fontSize: '14px',
  },
  section: {
    marginBottom: '30px',
    padding: '20px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
  },
}
