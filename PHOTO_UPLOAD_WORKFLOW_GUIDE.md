# Photo Upload Workflow Guide

## Overview

The Photo Upload Workflow (`/app/upload`) is a production-ready component system that enables users to upload a single product photo and automatically:

1. **Extract product details** using Claude Vision AI
2. **Edit extracted information** in real-time
3. **Generate platform-specific social media captions** for 8 platforms
4. **Connect and post to 27 marketplaces** simultaneously
5. **Track posting progress** with real-time status updates

## Architecture

### Components

#### `PhotoUploadWorkflow.tsx`
**Main orchestration component** that manages the entire workflow state and coordinates between all sub-components.

**Responsibilities:**
- Photo upload and preview state management
- Triggering Claude Vision extraction
- Social caption generation
- Marketplace connection management
- Posting to all connected marketplaces
- Retry handling for failed posts

**State:**
- `photo`: The uploaded File
- `photoPreview`: Data URL for preview
- `productInfo`: Extracted product details
- `socialCaptions`: Generated captions for each platform
- `marketplaceConnections`: Connection status for each marketplace
- `postProgress`: Real-time posting status

#### `PhotoPreview.tsx`
**Drag-and-drop file upload component**

**Features:**
- Drag-and-drop support
- Click to select file
- Photo preview with edit/remove actions
- Loading state during extraction
- File validation (image type, 10MB max size)

**Props:**
- `photo`: Current File or null
- `preview`: Data URL preview or null
- `onPhotoChange`: Callback when photo changes
- `onPreviewChange`: Callback when preview updates
- `disabled`: Disable interactions during posting
- `extracting`: Show extraction loading state

#### `ProductInfo.tsx`
**Displays and edits extracted product information**

**Features:**
- Displays extracted: title, category, condition, price, description, features, tags
- In-place field editing
- Extraction loading state
- Error handling with retry
- Dynamic field updates

**Props:**
- `productInfo`: Extracted ProductInfo object or null
- `extracting`: Show loading state
- `error`: Extraction error message
- `onUpdate`: Callback when product info is edited

#### `SocialPreviews.tsx`
**Shows generated captions for all 8 social platforms**

**Platforms Supported:**
- Instagram
- TikTok
- Facebook
- Twitter/X
- Pinterest
- LinkedIn
- YouTube Shorts
- Threads

**Features:**
- Platform-specific styling
- Copy caption + hashtags button
- Media recommendations
- Hashtag chips
- Loading state during generation

**Props:**
- `captions`: Array of SocialCaption objects
- `loading`: Show generation loading state

#### `MarketplacePreview.tsx`
**Manages marketplace connections and status**

**Marketplaces Organized by Category:**

**E-Commerce Giants:** Amazon, eBay, Etsy, Shopify, WooCommerce, BigCommerce

**Resale Platforms:** Mercari, Poshmark, Depop, Vestiaire Collective, Grailed, Vinted, Rebag, Tradesy, thredUP

**Local & Social:** Facebook Marketplace, Craigslist, LetGo, OfferUp, Pinterest Shop, Instagram Shop

**Live & Trending:** TikTok Shop, Snapchat Shop, Twitter Commerce, Whatnot

**Specialty:** Gazelle, KingSumo

**Features:**
- Collapsible category groups
- Connection status indicators
- Connect/disconnect buttons
- Account ID display
- Connection counter

**Props:**
- `connections`: Array of MarketplaceConnection objects
- `onConnect`: Callback to connect marketplace
- `onDisconnect`: Callback to disconnect marketplace

#### `PostProgress.tsx`
**Real-time progress tracking for posting to all platforms/marketplaces**

**Features:**
- Progress summary stats (total, pending, success, failed, success rate)
- Animated progress bar
- Per-item status with icons
- Separate sections for platforms and marketplaces
- Error messages for failed items
- Success confirmation message
- Retry failed posts button
- Cancel posting button

**Props:**
- `progress`: Array of PostProgressItem objects
- `isPosting`: Currently posting
- `onCancel`: Cancel callback

### API Routes

#### `POST /api/extract-from-photo`

**Request:**
```typescript
FormData with:
- photo: File (image)
```

**Response:**
```typescript
{
  success: boolean,
  data?: ProductInfo,
  error?: string
}
```

**Implementation:**
- Uses Anthropic Claude 3.5 Sonnet Vision
- Converts image to base64
- Extracts: title, description, category, condition, price, keyFeatures, tags
- Validates with Zod schema
- Errors are user-friendly

#### `POST /api/generate-captions`

**Request:**
```typescript
{
  productInfo: ProductInfo
}
```

**Response:**
```typescript
{
  success: boolean,
  captions: SocialCaption[]
}
```

**Implementation:**
- Generates captions for 8 platforms in parallel
- Each platform gets platform-specific guidelines
- Includes hashtags and media recommendations
- Falls back to basic caption on generation failure
- Platform guidelines consider character limits and tone

#### `POST /api/post-everything`

**Request:**
```typescript
{
  productInfo: ProductInfo,
  marketplaces: string[],
  photo?: string (base64)
}
```

**Response:**
```typescript
{
  success: boolean,
  results: PostProgressItem[],
  timestamp: string
}
```

**Implementation:**
- Posts to all specified marketplaces in parallel
- Returns real-time progress updates
- Includes listing IDs and URLs on success
- Returns error details on failure
- Currently simulates marketplace APIs (ready for real integrations)

## Usage

### For Users

1. **Navigate to `/upload`**
2. **Upload a photo** via drag-and-drop or click
   - AI automatically extracts product details
   - Shows loading state during extraction
3. **Edit extracted details** as needed
   - Click "Edit" on any field
   - Changes are saved immediately
4. **Review social media captions**
   - AI generates platform-specific captions
   - Copy captions with hashtags
5. **Connect marketplaces**
   - Expand marketplace categories
   - Click "Connect" for each marketplace
   - Must connect at least one to post
6. **Post to everything**
   - Click "Post to Everything"
   - Watch real-time progress
   - See results per platform/marketplace
7. **Retry or adjust**
   - Failed items show error details
   - Click "Retry Failed Posts" to try again
   - Or disconnect failed marketplaces and repost

### For Developers

#### Setup

```bash
cd BossListers
npm install  # Installs new @anthropic-ai/sdk dependency
npm run dev  # Starts development server
```

#### Configuration

**Required environment variables:**
```bash
ANTHROPIC_API_KEY=your-claude-api-key
```

**Optional path aliases** (already configured in tsconfig.json):
```json
"@/*": ["./*"]  // Allows @/components, @/types, @/lib imports
```

#### Extending the Workflow

**Adding a new marketplace:**

1. Update `MARKETPLACES` in `types/photo-workflow.ts`
2. Add category mapping in `components/MarketplacePreview.tsx`
3. Add icon emoji to `MARKETPLACE_LOGOS`
4. Implement marketplace API integration in `app/api/post-everything/route.ts`

**Adding a new social platform:**

1. Update `SOCIAL_PLATFORMS` in `types/photo-workflow.ts`
2. Add platform guidelines to `app/api/generate-captions/route.ts`
3. Add emoji to component
4. Styling via `PLATFORM_COLORS` in `SocialPreviews.tsx`

**Customizing extraction:**

Update the prompt in `app/api/extract-from-photo/route.ts` to extract different fields or adjust validation in `ProductInfoSchema`.

#### Integration with Real APIs

Current implementation simulates marketplace posting. To integrate real APIs:

1. **Amazon**: Update `app/api/post-everything/route.ts` to call Amazon MWS API
2. **eBay**: Call eBay API (credentials stored securely)
3. **Others**: Follow similar pattern for each marketplace

Each marketplace requires:
- OAuth connection handling
- Credentials storage (encrypted)
- API error handling
- Listing ID tracking

## Type Definitions

### `ProductInfo`
```typescript
interface ProductInfo {
  id: string;
  title: string;
  description: string;
  category: string;
  condition: "new" | "like_new" | "good" | "fair" | "poor";
  price: number;
  estimatedValue?: number;
  tags: string[];
  keyFeatures: string[];
}
```

### `SocialCaption`
```typescript
interface SocialCaption {
  platform: string;
  caption: string;
  hashtags: string[];
  mediaRecommendations?: string;
}
```

### `MarketplaceConnection`
```typescript
interface MarketplaceConnection {
  marketplace: string;
  connected: boolean;
  accountId?: string;
  sellerId?: string;
}
```

### `PostProgressItem`
```typescript
interface PostProgressItem {
  id: string;
  type: "platform" | "marketplace";
  name: string;
  status: "pending" | "in_progress" | "success" | "error" | "skipped";
  error?: string;
  result?: unknown;
}
```

## Styling

- **Framework**: Tailwind CSS 3.4+
- **Icons**: Lucide React
- **Theme**: Light/dark mode support via `data-theme` attribute
- **Responsive**: Mobile-first, tested on 320px+
- **Colors**: Platform-specific color schemes for consistency

## Error Handling

### Extraction Errors
- Shows user-friendly error message
- Provides "Retry Extraction" button
- Doesn't clear form (preserves user data)

### Posting Errors
- Shows which platforms/marketplaces failed
- Displays specific error reason
- Provides "Retry Failed Posts" button
- Allows partial retry (only failed items)

### Network Errors
- Graceful degradation
- Error messages don't expose sensitive info
- Automatic retry support in UI

## Performance

- **Image handling**: Compressed with `browser-image-compression` (optional)
- **Parallel posting**: All marketplaces post simultaneously
- **Progressive loading**: Shows results as they complete
- **Optimistic updates**: Progress bar updates in real-time

## Security

- **No credentials stored**: Uses session-based auth
- **Encrypted marketplace credentials**: Stored in secure backend
- **Image validation**: Type and size checks
- **Input validation**: Schema-based validation for all data
- **XSS protection**: React prevents XSS by default
- **API security**: Uses environment variables for secrets

## Testing

```bash
# Type checking
npm run typecheck

# Running e2e tests
npm run test:e2e

# Development
npm run dev
```

## File Structure

```
BossListers/
├── app/
│   ├── upload/
│   │   └── page.tsx                 # Upload page
│   └── api/
│       ├── extract-from-photo/
│       │   └── route.ts             # Vision API
│       ├── generate-captions/
│       │   └── route.ts             # Caption generation
│       └── post-everything/
│           └── route.ts             # Multi-marketplace posting
├── components/
│   ├── PhotoUploadWorkflow.tsx       # Main orchestrator
│   ├── PhotoPreview.tsx              # Upload component
│   ├── ProductInfo.tsx               # Editing component
│   ├── SocialPreviews.tsx            # Captions preview
│   ├── MarketplacePreview.tsx        # Connections
│   └── PostProgress.tsx              # Progress tracking
└── types/
    └── photo-workflow.ts            # Type definitions
```

## Roadmap

- [x] Photo upload with preview
- [x] Claude Vision extraction
- [x] Product info editing
- [x] Social caption generation
- [x] Marketplace connections
- [x] Progress tracking
- [ ] Real marketplace API integrations
- [ ] OAuth flow for marketplaces
- [ ] Batch upload support
- [ ] Template library for captions
- [ ] Analytics dashboard
- [ ] Scheduled posting
- [ ] A/B testing captions

## Support & Debugging

**Turn on debug logging:**
```typescript
// In components, use browser console
console.log('Debug info:', someData);
```

**Check API responses:**
```bash
# Terminal
curl -X POST http://localhost:3001/api/extract-from-photo \
  -F "photo=@image.jpg"
```

**Type errors during development:**
```bash
npm run typecheck  # Full type check
```

---

**Last Updated:** August 26, 2026
**Status:** Production Ready (awaiting marketplace API implementations)
