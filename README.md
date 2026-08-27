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
