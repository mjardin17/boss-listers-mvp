export default function GetTokens() {
  return (
    <div style={{maxWidth: '600px', margin: '0 auto', padding: '40px', fontFamily: 'system-ui'}}>
      <h1>🔑 Get OAuth Tokens</h1>
      <p>Click each button below to authorize and get your access tokens</p>

      <div style={{background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginBottom: '30px'}}>
        <h2>🎵 TikTok</h2>
        <p>Click below to authorize TikTok and get your access token</p>
        <a href="/api/oauth/tiktok/authorize" style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#000',
          color: '#25f4ee',
          textDecoration: 'none',
          borderRadius: '6px',
          fontWeight: 'bold',
          marginBottom: '20px'
        }}>
          ➡️ Authorize TikTok
        </a>
      </div>

      <div style={{background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginBottom: '30px'}}>
        <h2>📺 YouTube</h2>
        <p>Click below to authorize YouTube and get your access token</p>
        <a href="/api/oauth/youtube/authorize" style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#ff0000',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '6px',
          fontWeight: 'bold',
          marginBottom: '20px'
        }}>
          ➡️ Authorize YouTube
        </a>
      </div>

      <div style={{background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginBottom: '30px'}}>
        <h2>𝕏 Twitter</h2>
        <p>Click below to authorize Twitter and get your access token</p>
        <a href="/api/oauth/twitter/authorize" style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#000',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '6px',
          fontWeight: 'bold',
          marginBottom: '20px'
        }}>
          ➡️ Authorize Twitter
        </a>
      </div>

      <div style={{background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginBottom: '30px'}}>
        <h2>📦 Amazon</h2>
        <p>Click below to authorize Amazon and get your access token</p>
        <a href="/api/oauth/amazon/authorize" style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#FF9900',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '6px',
          fontWeight: 'bold',
          marginBottom: '20px'
        }}>
          ➡️ Authorize Amazon
        </a>
      </div>

      <div style={{background: '#e8f5e9', padding: '20px', borderRadius: '8px', marginTop: '30px'}}>
        <h3>✅ Already Set Up (No action needed):</h3>
        <ul>
          <li>✅ eBay - Ready to use</li>
          <li>✅ Etsy - Ready to use</li>
          <li>✅ Facebook - Ready to use</li>
          <li>✅ Instagram - Ready to use</li>
        </ul>
      </div>

      <div style={{background: '#fff3cd', padding: '20px', borderRadius: '8px', marginTop: '20px'}}>
        <h3>📋 Next Steps:</h3>
        <ol>
          <li>Click the "Authorize" button for each platform</li>
          <li>You'll be redirected to log in</li>
          <li>Approve the permissions</li>
          <li>Copy the token from the confirmation page</li>
          <li>Paste into .env.local</li>
          <li>Restart: npm run dev</li>
        </ol>
      </div>
    </div>
  );
}
