# Photo Upload Workflow - Quick Start

## Installation

```bash
npm install  # Install @anthropic-ai/sdk dependency
npm run dev  # Start development server
```

## Access

Navigate to: **`http://localhost:3001/upload`**

## Quick Demo Flow

1. **Upload Photo** → Drag and drop or click to select
2. **Auto-Extract** → AI analyzes and extracts product details (2-5 seconds)
3. **Edit Details** → Click "Edit" on any field to customize
4. **View Captions** → See platform-specific captions for all 8 social networks
5. **Connect Marketplaces** → Click "Connect" on desired marketplaces
6. **Post Everything** → Single click posts to all connected platforms
7. **Track Progress** → Watch real-time status updates
8. **Retry If Needed** → Click "Retry Failed Posts" for any failures

## Component Hierarchy

```
PhotoUploadWorkflow (main)
├── PhotoPreview (upload)
├── ProductInfo (extraction results + editing)
├── SocialPreviews (8 platform captions)
├── MarketplacePreview (27 marketplace connections)
└── PostProgress (real-time posting status)
```

## API Endpoints

```
POST /api/extract-from-photo
├─ Input: FormData with photo
└─ Output: ProductInfo object

POST /api/generate-captions
├─ Input: ProductInfo
└─ Output: SocialCaption[] (8 platforms)

POST /api/post-everything
├─ Input: ProductInfo + marketplaces[]
└─ Output: PostProgressItem[] with statuses
```

## File Locations

```
components/
  ├─ PhotoUploadWorkflow.tsx (main orchestrator)
  ├─ PhotoPreview.tsx
  ├─ ProductInfo.tsx
  ├─ SocialPreviews.tsx
  ├─ MarketplacePreview.tsx
  └─ PostProgress.tsx

app/api/
  ├─ extract-from-photo/route.ts
  ├─ generate-captions/route.ts
  └─ post-everything/route.ts

app/upload/
  └─ page.tsx

types/
  └─ photo-workflow.ts
```

## Customization

### Add a Marketplace
Edit `types/photo-workflow.ts`:
```typescript
export const MARKETPLACES = [
  // ... existing
  "your_marketplace",
] as const;
```

### Change Extraction Prompts
Edit `app/api/extract-from-photo/route.ts` - modify the system message to Claude

### Adjust Social Platforms
Edit `types/photo-workflow.ts` and `SOCIAL_PLATFORMS` array

### Custom Styling
All components use Tailwind CSS - edit inline classes or global CSS

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-...  # Required for Claude API
```

## Features Reference

| Feature | Component | Status |
|---------|-----------|--------|
| Drag-drop upload | PhotoPreview | ✅ Complete |
| Photo preview | PhotoPreview | ✅ Complete |
| Claude Vision extraction | PhotoPreview + API | ✅ Complete |
| In-place editing | ProductInfo | ✅ Complete |
| 8 social captions | SocialPreviews | ✅ Complete |
| Copy caption+hashtags | SocialPreviews | ✅ Complete |
| 27 marketplaces | MarketplacePreview | ✅ Complete |
| Real-time progress | PostProgress | ✅ Complete |
| Error retry | PostProgress | ✅ Complete |
| Dark mode | All components | ✅ Complete |
| Mobile responsive | All components | ✅ Complete |

## Troubleshooting

**"Cannot find module @anthropic-ai/sdk"**
→ Run: `npm install`

**Extraction takes too long**
→ Normal (1-5 seconds). Check ANTHROPIC_API_KEY is set.

**Social captions don't generate**
→ API might be slow. Check browser console for errors.

**Marketplace posting fails**
→ Currently simulated. Real integrations coming soon.

**Dark mode not working**
→ Check browser theme preference or `data-theme` attribute on root element

## Development Tips

- Hot reload enabled during `npm run dev`
- Use React DevTools to inspect component state
- Check browser console for API errors
- Network tab shows all API requests
- Type checking: `npm run typecheck`

## Performance Notes

- Image extraction: 2-5 seconds (Claude Vision)
- Caption generation: 3-8 seconds (8 platforms in parallel)
- Marketplace posting: Simulated, adds 1-3 seconds per connection
- Optimistic UI updates - shows pending immediately

## Security Notes

- No credentials stored in browser
- Images converted to base64 (kept in memory only)
- API uses environment variables for secrets
- All inputs validated server-side
- Marketplace credentials would be encrypted in production

## Next Steps for Production

1. Install dependencies: `npm install`
2. Set ANTHROPIC_API_KEY environment variable
3. Test upload workflow with sample product image
4. Integrate real marketplace APIs (see guide)
5. Implement OAuth for marketplace authentication
6. Deploy to production

## Support

See **`PHOTO_UPLOAD_WORKFLOW_GUIDE.md`** for detailed documentation.
