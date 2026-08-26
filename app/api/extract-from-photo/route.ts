import { Anthropic } from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ProductInfo, ExtractResponse } from "../../types/photo-workflow";

const ProductInfoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  category: z.string(),
  condition: z.enum(["new", "like_new", "good", "fair", "poor"]),
  price: z.number().min(0),
  keyFeatures: z.array(z.string()),
  tags: z.array(z.string()),
});

const client = new Anthropic();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const photoFile = formData.get("photo");

    if (!photoFile || !(photoFile instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No photo provided" },
        { status: 400 }
      );
    }

    // Convert file to base64
    const buffer = await photoFile.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Get MIME type
    const mimeType = photoFile.type || "image/jpeg";

    // Use Claude Vision to extract product information
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: base64,
              },
            },
            {
              type: "text",
              text: `Analyze this product image and extract the following information. Return ONLY a JSON object (no markdown, no extra text) with:
{
  "title": "Product name/title",
  "description": "Detailed description of the product",
  "category": "Product category",
  "condition": "Product condition: 'new', 'like_new', 'good', 'fair', or 'poor'",
  "price": "Estimated fair market price as a number",
  "keyFeatures": ["List", "of", "key", "features"],
  "tags": ["Relevant", "tags", "for", "searching"]
}

Be accurate and detailed. If you cannot determine a field, use reasonable estimates based on the image.`,
            },
          ],
        },
      ],
    });

    // Extract JSON from response
    const textContent = response.content.find((block: any) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON from the response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse product information");
    }

    const productData = JSON.parse(jsonMatch[0]);

    // Validate schema
    const validatedData = ProductInfoSchema.parse(productData);

    // Create ProductInfo object
    const productInfo: ProductInfo = {
      id: `product-${Date.now()}`,
      title: validatedData.title,
      description: validatedData.description,
      category: validatedData.category,
      condition: validatedData.condition,
      price: validatedData.price,
      tags: validatedData.tags,
      keyFeatures: validatedData.keyFeatures,
    };

    const result: ExtractResponse = {
      success: true,
      data: productInfo,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Extract error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract product information",
      },
      { status: 500 }
    );
  }
}
