import { NextRequest, NextResponse } from "next/server";
import type {
  ProductInfo,
  PostProgressItem,
  PostEverythingResponse,
} from "../../types/photo-workflow";

interface PostRequest {
  productInfo: ProductInfo;
  marketplaces: string[];
  photo?: string;
}

async function postToMarketplace(
  marketplace: string,
  productInfo: ProductInfo
): Promise<PostProgressItem> {
  const id = `${marketplace}-${Date.now()}`;

  try {
    // Simulate posting to marketplace
    // In a real implementation, this would call the actual marketplace APIs
    // (Amazon MWS, eBay API, Mercari API, etc.)

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Simulate occasional failures for demo purposes (10% failure rate)
    if (Math.random() < 0.1) {
      return {
        id,
        type: "marketplace",
        name: marketplace.replace("_", " "),
        status: "error",
        error: `Failed to connect to ${marketplace}. Please check your credentials.`,
      };
    }

    // Success
    return {
      id,
      type: "marketplace",
      name: marketplace.replace("_", " "),
      status: "success",
      result: {
        listingId: `listing-${marketplace}-${Date.now()}`,
        url: `https://${marketplace}.example.com/listing/${Date.now()}`,
        postedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      id,
      type: "marketplace",
      name: marketplace.replace("_", " "),
      status: "error",
      error:
        error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { productInfo, marketplaces, photo } = (await request.json()) as PostRequest;

    if (!productInfo || !marketplaces || marketplaces.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Post to all marketplaces concurrently
    const postPromises = marketplaces.map((marketplace) =>
      postToMarketplace(marketplace, productInfo)
    );

    const results = await Promise.all(postPromises);

    const response: PostEverythingResponse = {
      success: results.every((r: PostProgressItem) => r.status === "success"),
      results,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Post everything error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to post listings",
      },
      { status: 500 }
    );
  }
}
