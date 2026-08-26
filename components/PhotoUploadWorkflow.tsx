"use client";

import { AlertCircle, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProductInfo as ProductInfoType,
  SocialCaption,
  MarketplaceConnection,
  PostProgressItem,
  PostEverythingResponse,
  ExtractResponse,
} from "@/types/photo-workflow";
import { PhotoPreview } from "./PhotoPreview";
import { ProductInfo } from "./ProductInfo";
import { SocialPreviews } from "./SocialPreviews";
import { MarketplacePreview } from "./MarketplacePreview";
import { PostProgress } from "./PostProgress";
import { ExtractionProgress } from "./ExtractionProgress";

export function PhotoUploadWorkflow() {
  // Photo upload state
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractionMessages, setExtractionMessages] = useState<string[]>([]);
  const [productInfo, setProductInfo] = useState<ProductInfoType | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Social captions state
  const [socialCaptions, setSocialCaptions] = useState<SocialCaption[] | null>(
    null
  );
  const [captionLoading, setCaptionLoading] = useState(false);

  // Marketplace connections
  const [marketplaceConnections, setMarketplaceConnections] = useState<
    MarketplaceConnection[]
  >([]);

  // Posting state
  const [posting, setPosting] = useState(false);
  const [postProgress, setPostProgress] = useState<PostProgressItem[]>([]);
  const [postError, setPostError] = useState<string | null>(null);
  const postEventSourceRef = useRef<EventSource | null>(null);

  // Cleanup event sources on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (postEventSourceRef.current) {
        postEventSourceRef.current.close();
      }
    };
  }, []);

  // Upload and extract product info with SSE streaming
  const handlePhotoChange = useCallback(async (file: File | null) => {
    setPhoto(file);

    if (!file) {
      setProductInfo(null);
      setSocialCaptions(null);
      setExtractionError(null);
      setExtractionMessages([]);
      return;
    }

    setExtracting(true);
    setExtractionError(null);
    setExtractionMessages([]);

    try {
      const formData = new FormData();
      formData.append("photo", file);

      const response = await fetch("/api/extract-from-photo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to extract product information");
      }

      const data = (await response.json()) as ExtractResponse;

      if (!data.success || !data.data) {
        throw new Error(data.error || "Extraction failed");
      }

      setProductInfo(data.data);
      setExtractionMessages((prev) => [
        ...prev,
        "Product information extracted successfully",
      ]);

      // Generate social captions
      setCaptionLoading(true);
      setExtractionMessages((prev) => [...prev, "Generating social captions..."]);

      const captionResponse = await fetch("/api/generate-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productInfo: data.data }),
      });

      if (captionResponse.ok) {
        const captionData = await captionResponse.json();
        setSocialCaptions(captionData.captions || []);
        setExtractionMessages((prev) => [
          ...prev,
          `Generated ${captionData.captions?.length || 0} social captions`,
        ]);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred";
      setExtractionError(errorMessage);
      setExtractionMessages((prev) => [...prev, `Error: ${errorMessage}`]);
      setProductInfo(null);
    } finally {
      setExtracting(false);
      setCaptionLoading(false);
    }
  }, []);

  // Handle marketplace connection toggle
  const handleMarketplaceConnect = (marketplace: string) => {
    setMarketplaceConnections((prev) => {
      const existing = prev.find((c) => c.marketplace === marketplace);
      if (existing) {
        return prev.map((c) =>
          c.marketplace === marketplace ? { ...c, connected: !c.connected } : c
        );
      }
      return [
        ...prev,
        {
          marketplace: marketplace as any,
          connected: true,
          accountId: `account-${marketplace}`,
          sellerId: `seller-${Date.now()}`,
        },
      ];
    });
  };

  const handleMarketplaceDisconnect = (marketplace: string) => {
    setMarketplaceConnections((prev) =>
      prev.map((c) =>
        c.marketplace === marketplace ? { ...c, connected: false } : c
      )
    );
  };

  // Post to all platforms and marketplaces with SSE streaming
  const handlePostEverything = async () => {
    if (!productInfo) {
      setPostError("Please extract product information first");
      return;
    }

    const connectedMarketplaces = marketplaceConnections.filter(
      (c) => c.connected
    );
    if (connectedMarketplaces.length === 0) {
      setPostError("Please connect at least one marketplace");
      return;
    }

    setPosting(true);
    setPostError(null);

    // Create initial progress items
    const initialProgress: PostProgressItem[] = connectedMarketplaces.map(
      (conn) => ({
        id: `${conn.marketplace}-${Date.now()}`,
        type: "marketplace" as const,
        name: conn.marketplace.replace("_", " "),
        status: "pending" as const,
      })
    );

    setPostProgress(initialProgress);

    try {
      const requestBody = {
        productInfo,
        marketplaces: connectedMarketplaces.map((c) => c.marketplace),
        photo: photoPreview,
      };

      const response = await fetch("/api/post-everything", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error("Failed to post listings");
      }

      const data = (await response.json()) as PostEverythingResponse;

      // Update progress with results
      setPostProgress((prev) =>
        prev.map((item) => {
          const result = data.results.find((r) => r.id === item.id);
          return result || item;
        })
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to post listings";
      setPostError(errorMsg);

      // Mark all as error
      setPostProgress((prev) =>
        prev.map((item) => ({
          ...item,
          status: "error" as const,
          error: errorMsg,
        }))
      );
    } finally {
      setPosting(false);
    }
  };

  const handleRetry = async () => {
    const failedItems = postProgress.filter((p) => p.status === "error");
    if (failedItems.length === 0) return;

    // Reset failed items to pending
    setPostProgress((prev) =>
      prev.map((item) =>
        item.status === "error" ? { ...item, status: "pending" as const } : item
      )
    );

    setPosting(true);

    try {
      const failedMarketplaces = failedItems
        .filter((p) => p.type === "marketplace")
        .map((p) => p.name.replace(" ", "_"));

      const response = await fetch("/api/post-everything", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productInfo,
          marketplaces: failedMarketplaces,
          photo: photoPreview,
        }),
      });

      if (!response.ok) {
        throw new Error("Retry failed");
      }

      const data = (await response.json()) as PostEverythingResponse;

      setPostProgress((prev) =>
        prev.map((item) => {
          const result = data.results.find((r) => r.id === item.id);
          return result || item;
        })
      );
    } catch (error) {
      console.error("Retry error:", error);
      setPostError(
        error instanceof Error ? error.message : "Retry failed"
      );
    } finally {
      setPosting(false);
    }
  };

  const canPost =
    productInfo &&
    marketplaceConnections.some((c) => c.connected) &&
    !extracting &&
    !posting;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 py-8">
      {postError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-600 dark:text-red-400 mb-1">
              Error
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400">
              {postError}
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Photo Upload */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <PhotoPreview
          photo={photo}
          preview={photoPreview}
          onPhotoChange={handlePhotoChange}
          onPreviewChange={setPhotoPreview}
          disabled={posting}
          extracting={extracting}
        />
      </div>

      {/* Extraction Progress */}
      {(extracting || extractionMessages.length > 0) && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <ExtractionProgress
            messages={extractionMessages}
            isExtracting={extracting}
            error={extractionError}
          />
        </div>
      )}

      {/* Step 2: Product Info */}
      {productInfo || extracting || extractionError ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <ProductInfo
            productInfo={productInfo}
            extracting={extracting}
            error={extractionError}
            onUpdate={(updated) => {
              setProductInfo(updated);
              setExtractionError(null);
            }}
          />

          {extractionError && (
            <div className="mt-4">
              <button
                onClick={() => photo && handlePhotoChange(photo)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Extraction
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Step 3: Social Captions */}
      {productInfo ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <SocialPreviews captions={socialCaptions} loading={captionLoading} />
        </div>
      ) : null}

      {/* Step 4: Marketplace Connections */}
      {productInfo ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <MarketplacePreview
            connections={marketplaceConnections}
            productInfo={productInfo}
            onConnect={handleMarketplaceConnect}
            onDisconnect={handleMarketplaceDisconnect}
          />
        </div>
      ) : null}

      {/* Step 5: Post Progress */}
      {postProgress.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <PostProgress
            progress={postProgress}
            isPosting={posting}
            onCancel={() => setPosting(false)}
          />

          {!posting && postProgress.some((p) => p.status === "error") && (
            <div className="mt-4">
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 dark:bg-amber-700 text-white rounded-lg hover:bg-amber-700 dark:hover:bg-amber-800 font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Failed Posts
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Post Everything Button */}
      {productInfo && !postProgress.length && (
        <div className="sticky bottom-6 flex gap-3">
          <button
            onClick={handlePostEverything}
            disabled={!canPost}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {posting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Posting...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Post to Everything
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
