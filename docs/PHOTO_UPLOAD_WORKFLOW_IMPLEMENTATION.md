# Photo Upload Workflow Implementation Guide

## Overview

The PhotoUploadWorkflow is a comprehensive end-to-end automation system that enables users to:
1. Upload a photo of an item
2. Extract product information using AI vision
3. Generate platform-specific social media captions
4. Preview listings with platform-specific field truncation
5. Connect to 27+ marketplaces
6. Post listings to all connected platforms with a single click

## Architecture

### Main Component: `PhotoUploadWorkflow.tsx` (~400 lines)

The main orchestrator component manages:
- Photo upload and preview state
- Product information extraction
- Social media caption generation
- Marketplace connections
- Posting to all platforms

**Key Features:**
- SSE streaming for extraction progress
- Real-time status updates during posting
- Error handling and retry logic
- Character count validation
- Platform-specific field truncation

### Sub-Components

#### 1. **PhotoPreview.tsx** (~100 lines)
Handles photo upload via drag-and-drop or click-to-upload.

**Features:**
- Drag-and-drop file upload
- File validation (type, size limits)
- Image preview with remove/change buttons
- Loading state during extraction

#### 2. **ExtractionProgress.tsx** (~80 lines)
Displays real-time extraction progress messages.

**Features:**
- Streams extraction steps (uploading, analyzing, extracting)
- Shows success/error icons
- Color-coded messages
- Auto-scrolling to latest message

#### 3. **ProductInfo.tsx** (~120 lines)
Editable product information editor with character count validation.

**Fields:**
- Title (200 char limit)
- Description (4000 char limit)
- Category
- Condition (enum: new, like_new, good, fair, poor)
- Price (number)
- Estimated Value (optional)
- Tags (comma-separated)
- Key Features (comma-separated)

**Features:**
- Inline field editing
- Character count display
- Over-limit warnings
- Field validation

#### 4. **SocialPreviews.tsx** (~100 lines)
Platform-optimized social media caption previews.

**Features:**
- Character count per platform with limits:
  - Twitter/Threads: 280 chars
  - Instagram/TikTok: 2,200 chars
  - LinkedIn: 3,000 chars
  - Pinterest: 500 chars
  - YouTube Shorts: 5,000 chars
- Platform-specific icons and colors
- Copy-to-clipboard functionality
- Visual warnings for over-limit content
- Hashtag display

#### 5. **MarketplacePreview.tsx** (~150 lines)
Marketplace connection management with package preview.

**Features:**
- 27 marketplace integrations
- Categorized by type (E-Commerce Giants, Resale, Local, etc.)
- Platform-specific field length limits:
  - Amazon: title 200, description 2000
  - eBay: title 140, description 4000
  - Mercari: title 60, description 1000
  - And 24 more...
- Collapsible preview showing truncated title/description
- Connection status tracking
- Character count display

#### 6. **PostProgress.tsx** (~150 lines)
Real-time posting progress tracker.

**Features:**
- Summary stats (total, pending, success, failed)
- Progress bar showing completion percentage
- Live status updates per marketplace/platform
- Auto-scroll to active/error items
- Error messages for failed posts
- Retry functionality
- Success/error notifications

## API Integration

### 1. POST `/api/extract-from-photo`
Extracts product information from photo using Claude Vision.

**Request:**
```typescript
FormData with:
- photo: File
```

**Response:**
```typescript
{
  success: boolean;
  data?: ProductInfo;
  error?: string;
}
```

**ProductInfo Structure:**
```typescript
{
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

### 2. POST `/api/generate-captions`
Generates platform-optimized social media captions.

**Request:**
```typescript
{
  productInfo: ProductInfo;
}
```

**Response:**
```typescript
{
  captions: SocialCaption[];
}
```

**SocialCaption Structure:**
```typescript
{
  platform: string;
  caption: string;
  hashtags: string[];
  mediaRecommendations?: string;
}
```

### 3. POST `/api/post-everything`
Posts listings to all connected marketplaces and platforms.

**Request:**
```typescript
{
  productInfo: ProductInfo;
  marketplaces: string[];
  photo: string; // base64 encoded
}
```

**Response:**
```typescript
{
  success: boolean;
  results: PostProgressItem[];
  timestamp: string;
}
```

## Data Types

### ProductInfo
Located in `/types/photo-workflow.ts`

```typescript
export interface ProductInfo {
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

### MarketplaceConnection
```typescript
export interface MarketplaceConnection {
  marketplace: (typeof MARKETPLACES)[number];
  connected: boolean;
  accountId?: string;
  sellerId?: string;
}
```

### PostProgressItem
```typescript
export interface PostProgressItem {
  id: string;
  type: "platform" | "marketplace";
  name: string;
  status: "pending" | "in_progress" | "success" | "error" | "skipped";
  error?: string;
  result?: unknown;
}
```

## Platform Support

### Supported Marketplaces (27)
- **E-Commerce Giants:** Amazon, eBay, Etsy, Shopify, WooCommerce, BigCommerce
- **Resale Platforms:** Mercari, Poshmark, Depop, Vestiaire, Grailed, Vinted, Rebag, Tradesy, thredUP
- **Local & Social:** Facebook Marketplace, Craigslist, Letgo, OfferUp, Pinterest Shop, Instagram Shop
- **Live & Trending:** TikTok Shop, Snapchat Shop, Twitter Commerce, Whatnot
- **Specialty:** Gazelle, Kingsumo

### Supported Social Platforms (8)
- Instagram
- TikTok
- Facebook
- Twitter/X
- Pinterest
- LinkedIn
- YouTube Shorts
- Threads

## Field Length Limits

### Marketplace Title/Description Limits
```
Amazon:           200 title / 2000 desc
eBay:             140 title / 4000 desc
Mercari:          60 title / 1000 desc
Poshmark:         140 title / 800 desc
Depop:            120 title / 1000 desc
Vestiaire:        100 title / 800 desc
Etsy:             140 title / 4000 desc
Shopify:          255 title / 5000 desc
... and 19 more
```

### Social Media Character Limits
```
Twitter:          280 chars (including hashtags)
Threads:          500 chars (including hashtags)
Pinterest:        500 chars (including hashtags)
Instagram:        2200 chars (including hashtags)
TikTok:           2200 chars (including hashtags)
LinkedIn:         3000 chars (including hashtags)
YouTube Shorts:   5000 chars (including hashtags)
Facebook:         63206 chars (including hashtags)
```

## State Management

The main component uses React hooks for state management:

```typescript
// Photo upload state
const [photo, setPhoto] = useState<File | null>(null);
const [photoPreview, setPhotoPreview] = useState<string | null>(null);

// Extraction state
const [extracting, setExtracting] = useState(false);
const [extractionMessages, setExtractionMessages] = useState<string[]>([]);
const [productInfo, setProductInfo] = useState<ProductInfoType | null>(null);
const [extractionError, setExtractionError] = useState<string | null>(null);

// Social captions
const [socialCaptions, setSocialCaptions] = useState<SocialCaption[] | null>(null);
const [captionLoading, setCaptionLoading] = useState(false);

// Marketplace connections
const [marketplaceConnections, setMarketplaceConnections] = useState<MarketplaceConnection[]>([]);

// Posting state
const [posting, setPosting] = useState(false);
const [postProgress, setPostProgress] = useState<PostProgressItem[]>([]);
const [postError, setPostError] = useState<string | null>(null);
```

## User Flow

1. **Upload Photo**
   - User drags or clicks to upload image
   - Image is validated (type, size)
   - Preview is displayed

2. **Extract Details**
   - Photo is sent to Claude Vision API
   - Product info is extracted
   - Social captions are generated
   - Extraction progress is shown in real-time

3. **Review & Edit**
   - User can edit extracted fields
   - Character counts are shown
   - Over-limit warnings appear

4. **Connect Platforms**
   - User expands marketplace categories
   - Selects which platforms to use
   - Sees platform-specific field limits

5. **Preview Packages**
   - User can click "Show preview" on each marketplace
   - Sees how title/description will be truncated
   - Character counts shown for each field

6. **Post Everywhere**
   - Click "Post to Everything" button
   - Real-time progress updates
   - Success/error feedback per platform
   - Retry option for failed posts

## Error Handling

- **Validation Errors:** Character limit exceeded warnings
- **Extraction Errors:** User can retry with "Retry Extraction" button
- **Connection Errors:** Failed posts show error messages
- **Retry Logic:** Failed posts can be retried individually

## Accessibility Features

- Semantic HTML with proper heading hierarchy
- ARIA labels for interactive elements
- Keyboard navigation support
- Color contrast compliance (WCAG AA)
- Form validation feedback
- Loading states with clear messages
- Auto-scroll to in-progress items

## Performance Optimizations

- Lazy loading of marketplace categories
- Memoized components to prevent re-renders
- Efficient state updates
- Debounced character counting
- Optimized image preview generation

## File Structure

```
components/
├── PhotoUploadWorkflow.tsx        # Main orchestrator (~400 lines)
├── PhotoPreview.tsx               # Photo upload zone (~100 lines)
├── ExtractionProgress.tsx         # Extraction status (~80 lines)
├── ProductInfo.tsx                # Product editor (~120 lines)
├── SocialPreviews.tsx             # Social captions (~100 lines)
├── MarketplacePreview.tsx         # Marketplace selector (~150 lines)
└── PostProgress.tsx               # Posting tracker (~150 lines)

types/
└── photo-workflow.ts              # Type definitions

app/api/
├── extract-from-photo/route.ts    # Vision extraction API
├── generate-captions/route.ts     # Caption generation API
└── post-everything/route.ts       # Unified posting API
```

## Future Enhancements

- [ ] SSE streaming for real-time extraction/posting progress
- [ ] Video support for TikTok/YouTube content
- [ ] Bulk upload (multiple photos at once)
- [ ] Template system for product descriptions
- [ ] A/B testing captions per platform
- [ ] Analytics dashboard for post performance
- [ ] Scheduled posting to platforms
- [ ] Multi-photo carousel listings
- [ ] Inventory management integration
- [ ] Webhook support for marketplace updates

## Testing Considerations

- Mock Claude Vision API responses
- Test field truncation for each platform
- Verify character count calculations
- Test error handling and retry logic
- Verify marketplace connection state
- Test responsive design on mobile
- Accessibility testing with screen readers

## Dependencies

- React 18+
- TypeScript
- Tailwind CSS
- Lucide React (icons)
- Anthropic SDK (Claude Vision)
- Next.js (server/client)

## Styling

- Tailwind CSS with dark mode support
- Platform-specific color schemes
- Responsive grid layouts
- Smooth transitions and animations
- Status color coding (green=success, red=error, blue=info)
