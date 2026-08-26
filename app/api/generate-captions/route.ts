import { Anthropic } from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { ProductInfo, SocialCaption } from "../../types/photo-workflow";
import { SOCIAL_PLATFORMS } from "../../types/photo-workflow";

const PLATFORM_GUIDELINES: Record<string, string> = {
  instagram:
    "Engaging, hashtag-rich, use emojis, 150-300 chars, focus on visual appeal",
  tiktok:
    "Trendy, casual, use trending sounds/challenges, 50-100 chars, include call-to-action",
  facebook:
    "Community-focused, conversational, 100-200 chars, encourage engagement",
  twitter:
    "Concise, witty, 280 chars max, include relevant hashtags, conversational tone",
  pinterest:
    "Descriptive, SEO-focused, 100-150 chars, use numbers and keywords",
  linkedin:
    "Professional, value-focused, 200-300 chars, include industry insights",
  youtube_shorts:
    "Hook first, 30 seconds max, include call-to-action, use trending sounds",
  threads:
    "Authentic, casual, conversational, 150-200 chars, community-focused",
};

const client = new Anthropic();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { productInfo } = (await request.json()) as {
      productInfo: ProductInfo;
    };

    if (!productInfo) {
      return NextResponse.json(
        { success: false, error: "No product info provided" },
        { status: 400 }
      );
    }

    // Generate captions for each platform
    const captions: SocialCaption[] = [];

    for (const platform of SOCIAL_PLATFORMS) {
      try {
        const response = await client.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: `Create a social media caption for ${platform} based on this product:

Title: ${productInfo.title}
Description: ${productInfo.description}
Category: ${productInfo.category}
Condition: ${productInfo.condition}
Price: $${productInfo.price}
Features: ${productInfo.keyFeatures.join(", ")}

Guidelines for ${platform}: ${PLATFORM_GUIDELINES[platform]}

Provide ONLY a JSON response (no markdown, no code blocks) with:
{
  "caption": "The caption text",
  "hashtags": ["hashtag1", "hashtag2", ...],
  "mediaRecommendations": "Brief note about ideal image/video format for this platform"
}

Be creative, platform-specific, and engaging. Make the caption compelling to potential buyers.`,
            },
          ],
        });

        const textContent = response.content.find((block: any) => block.type === "text");
        if (!textContent || textContent.type !== "text") {
          throw new Error("No text response");
        }

        const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }

        const captionData = JSON.parse(jsonMatch[0]);

        captions.push({
          platform,
          caption: captionData.caption || "",
          hashtags: Array.isArray(captionData.hashtags)
            ? captionData.hashtags
            : [],
          mediaRecommendations: captionData.mediaRecommendations,
        });
      } catch (error) {
        console.error(`Failed to generate caption for ${platform}:`, error);
        // Add a fallback caption
        captions.push({
          platform,
          caption: `Check out this amazing ${productInfo.title}! ${productInfo.description.substring(0, 100)}`,
          hashtags: [
            platform === "tiktok" ? "#forsale" : "forsale",
            productInfo.category.toLowerCase().replace(" ", ""),
          ],
        });
      }
    }

    return NextResponse.json({ success: true, captions });
  } catch (error) {
    console.error("Caption generation error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate captions",
      },
      { status: 500 }
    );
  }
}
