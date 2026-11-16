# Boss Listers MVP

Post your items to 27 marketplaces and 8 social platforms instantly with AI-powered product extraction.

## ? Quick Start

```bash
npm install
npm run dev
# Visit http://localhost:3001
```

## ?? Features

- **AI Photo Analysis**: Upload a photo, AI extracts product details automatically
- **Multi-Channel Posting**: Post to 27 marketplaces simultaneously
- **Social Media Integration**: Auto-generate videos and post to 8 social platforms
- **Real-Time Tracking**: Monitor posting progress in real-time
- **Secure OAuth**: All platforms use OAuth 2.0 with encrypted token storage

## ?? Supported Platforms

### Marketplaces (27)
eBay, Etsy, Amazon, Shopify, Mercari, Poshmark, Facebook Marketplace, Craigslist, WhatNot, AbeBooks, Reverb, Discogs, Depop, Vinted, Grailed, Vestiaire Collective, The RealReal, StockX, GOAT, Mercado Libre, 5Miles, TikTok Shop, Alibris, WooCommerce, and more

### Social Platforms (8)
Instagram, TikTok, YouTube Shorts, Facebook, Twitter/X, LinkedIn, Snapchat, Pinterest

## ??? Architecture

```
Landing Page ? PhotoUploadWorkflow ? Extract ? Post Everywhere
    ?              ?                    ?           ?
  Hero        Upload Photo        Claude Vision  27 Marketplaces
 Features     Preview Items       Auto-Extract   8 Social Platforms
 Pricing      Edit Details        Generate       Real-Time Progress
              Marketplace Preview  Captions
              Social Preview
```

## ?? Project Structure

```
app/
+-- page.tsx              # Landing page
+-- layout.tsx            # Root layout
+-- globals.css           # Global styles

components/
+-- PhotoUploadWorkflow.tsx      # Main workflow
+-- PhotoPreview.tsx             # Upload zone
+-- ProductInfo.tsx              # Editable fields
+-- MarketplacePreview.tsx       # 27 platform preview
+-- SocialPreviews.tsx           # 8 platform captions
+-- PostProgress.tsx             # Real-time tracking
+-- ExtractionProgress.tsx       # AI extraction status

lib/
+-- socialMediaPosters.js        # 8 platform adapters
+-- socialMediaAuth.js           # OAuth configuration
+-- tokenManager.js              # Encryption
+-- channels/manualPackage.js    # 25+ marketplace configs

types/
+-- photo-workflow.ts            # TypeScript definitions
```

## ?? Deployment

### Build for Production
```bash
npm run build
```

### Deploy to Vercel (Recommended)
```bash
npm i -g vercel
vercel --prod
```

### Deploy to Railway
```bash
npm i -g @railway/cli
railway up --production
```

## ?? Environment Variables

Create `.env.local`:

```env
ANTHROPIC_API_KEY=your_api_key
DATABASE_URL=your_supabase_url
INSTAGRAM_CLIENT_ID=xxx
INSTAGRAM_CLIENT_SECRET=xxx
TIKTOK_CLIENT_ID=xxx
# ... (see HANDOFF.md for complete list)
APP_URL=https://yourdomain.com
```

## Empire OS

Boss Listers is a module of the Empire OS hub. The hub calls these routes (server to server):

| Route | What it does |
|---|---|
| `GET /empire/health` | Is Boss Listers up and set up? No key needed; shows what is configured, never values or data. |
| `POST /empire/event` | Accepts an Empire OS event (`topic` required), kept in memory. `GET` lists the last 50. |
| `GET /empire/listings?limit=10&stage=ready` | Stock list totals by stage and the newest items (owner's tenant). |
| `GET /empire/platforms` | Which selling sites have credentials set (names only, no live calls). |
| `POST /empire/stock/add` | Adds an item to the stock list as an **unlisted draft**, like the Stock page's Add form. `"dryRun": true` only checks it. Nothing is posted to any selling site. |

Every route except health needs the header `X-Empire-Key` matching `EMPIRE_SHARED_KEY` (set the same value as `BOSSLISTERS_EMPIRE_KEY` in Empire OS). Without `EMPIRE_SHARED_KEY` those routes answer 503. Data is read for `PLATFORM_OWNER_TENANT_ID` (falling back to `ownerTenantId` in `config/inventory-sync.json`).

Boss Listers keeps port **3001**. The Empire OS server defaults to 4000, so both can run side by side; in Empire OS set `BOSSLISTERS_BASE_URL=http://localhost:3001` (the default).

## ? Testing

```bash
npm test                    # Run all tests
npm run build              # Production build
npm run dev                # Development server
```

## ?? Performance

- Landing page: ~5KB gzipped
- Build size: 136KB
- Production ready: ?

## ?? Documentation

- [HANDOFF.md](./HANDOFF.md) - Complete session handoff for next dev
- [ARCHITECTURE_ADR.md](./docs/ARCHITECTURE_ADR.md) - Architecture decisions
- [IMPLEMENTATION_GUIDE.md](./docs/IMPLEMENTATION_GUIDE.md) - Implementation roadmap

## ?? Known Issues

### High Priority
- [ ] Add AbortController to prevent stale fetch requests
- [ ] Make file upload dropzone keyboard accessible
- [ ] Configure ESLint for react-hooks rules

### Medium Priority
- [ ] Regenerate captions when product info is edited
- [ ] Enforce rate limiting consistently

## ?? Development Workflow

1. Feature ? Branch
2. Test locally with `npm run dev`
3. Build with `npm run build`
4. Commit with conventional commits
5. Deploy to staging/production

## ?? Support

- GitHub: https://github.com/mjardin17/boss-listers-mvp
- Issues: GitHub Issues

## ?? License

MIT

---

**Status**: Production Ready ?
**Last Updated**: 2026-08-27
**Build**: `.next/` folder ready to deploy
