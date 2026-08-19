import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { ProductService } from "./src/services/product.service.ts";
import { MarketplaceService } from "./src/services/marketplace.service.ts";

dotenv.config();

const app = express();
const PORT = 3000;

const productService = new ProductService();
const marketplaceService = new MarketplaceService();

// Increase request size payload limit to support base64 images from camera
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Products API
app.get("/api/v1/products", async (req, res) => {
  try {
    const products = await productService.getProducts();
    res.json({ status: "success", data: products });
  } catch (error: any) {
    console.error("GET /api/v1/products error:", error);
    res.status(500).json({ status: "error", message: error.message || "Failed to fetch products" });
  }
});

app.get("/api/v1/products/:id", async (req, res) => {
  try {
    const product = await productService.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ status: "error", message: "Product not found" });
    }
    res.json({ status: "success", data: product });
  } catch (error: any) {
    console.error(`GET /api/v1/products/${req.params.id} error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to fetch product" });
  }
});

app.post("/api/v1/products", async (req, res) => {
  try {
    const product = await productService.createOrUpdateProduct(req.body);
    res.status(201).json({ status: "success", data: product });
  } catch (error: any) {
    console.error("POST /api/v1/products error:", error);
    res.status(500).json({ status: "error", message: error.message || "Failed to save product" });
  }
});

app.put("/api/v1/products/:id", async (req, res) => {
  try {
    const product = await productService.createOrUpdateProduct({ ...req.body, id: req.params.id });
    res.json({ status: "success", data: product });
  } catch (error: any) {
    console.error(`PUT /api/v1/products/${req.params.id} error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to update product" });
  }
});

app.delete("/api/v1/products/:id", async (req, res) => {
  try {
    await productService.deleteProduct(req.params.id);
    res.json({ status: "success", message: "Product deleted" });
  } catch (error: any) {
    console.error(`DELETE /api/v1/products/${req.params.id} error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to delete product" });
  }
});

// Marketplaces API
app.get("/api/v1/marketplaces", async (req, res) => {
  try {
    const connections = await marketplaceService.getConnections();
    res.json({ status: "success", data: connections });
  } catch (error: any) {
    console.error("GET /api/v1/marketplaces error:", error);
    res.status(500).json({ status: "error", message: error.message || "Failed to fetch marketplace connections" });
  }
});

app.get("/api/v1/marketplaces/:platform/status", async (req, res) => {
  try {
    const status = await marketplaceService.getConnectionStatus(req.params.platform);
    res.json({ status: "success", data: status });
  } catch (error: any) {
    console.error(`GET /api/v1/marketplaces/${req.params.platform}/status error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to fetch platform status" });
  }
});

app.post("/api/v1/marketplaces/:platform/connect", async (req, res) => {
  try {
    const result = await marketplaceService.connectPlatform(req.params.platform);
    res.json({ status: "success", data: result });
  } catch (error: any) {
    console.error(`POST /api/v1/marketplaces/${req.params.platform}/connect error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to connect platform" });
  }
});

app.post("/api/v1/marketplaces/:platform/disconnect", async (req, res) => {
  try {
    const result = await marketplaceService.disconnectPlatform(req.params.platform);
    res.json({ status: "success", data: result });
  } catch (error: any) {
    console.error(`POST /api/v1/marketplaces/${req.params.platform}/disconnect error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to disconnect platform" });
  }
});

app.get("/api/v1/marketplaces/:platform/auth-url", async (req, res) => {
  try {
    const state = (req.query.state as string) || `state_${Date.now()}`;
    const url = await marketplaceService.getAuthorizationUrl(req.params.platform, state);
    res.json({ status: "success", data: { url } });
  } catch (error: any) {
    console.error(`GET /api/v1/marketplaces/${req.params.platform}/auth-url error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to generate authorization URL" });
  }
});

app.post("/api/v1/marketplaces/:platform/callback", async (req, res) => {
  try {
    const { code } = req.body;
    const result = await marketplaceService.handleOAuthCallback(req.params.platform, code);
    res.json({ status: "success", data: result });
  } catch (error: any) {
    console.error(`POST /api/v1/marketplaces/${req.params.platform}/callback error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to exchange OAuth code" });
  }
});

// Marketplace Product Listing Operations (Transactional Outbox Dispatch)
app.post("/api/v1/products/:productId/listings/:platform", async (req, res) => {
  try {
    const result = await marketplaceService.publishListing(req.params.productId, req.params.platform);
    res.status(202).json({ status: "success", data: result });
  } catch (error: any) {
    console.error(`POST /api/v1/products/${req.params.productId}/listings/${req.params.platform} error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to queue listing creation" });
  }
});

app.put("/api/v1/products/:productId/listings/:platform", async (req, res) => {
  try {
    const result = await marketplaceService.updateListing(req.params.productId, req.params.platform);
    res.json({ status: "success", data: result });
  } catch (error: any) {
    console.error(`PUT /api/v1/products/${req.params.productId}/listings/${req.params.platform} error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to queue listing update" });
  }
});

app.delete("/api/v1/products/:productId/listings/:platform", async (req, res) => {
  try {
    const result = await marketplaceService.endListing(req.params.productId, req.params.platform);
    res.json({ status: "success", data: result });
  } catch (error: any) {
    console.error(`DELETE /api/v1/products/${req.params.productId}/listings/${req.params.platform} error:`, error);
    res.status(500).json({ status: "error", message: error.message || "Failed to queue listing end" });
  }
});


// Lazy-loaded Gemini AI client implementation
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// AI Meal analysis endpoint
app.post("/api/analyze-meal", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "No image data provided." });
    }

    let base64Data = "";
    let mimeType = "image/jpeg";

    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      mimeType = parts[0].replace(/^data:/, "");
      base64Data = parts[1];
    } else {
      base64Data = image;
    }

    const ai = getAI();

    const imagePart = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    const textPart = {
      text: "Analyze this photo of a meal. Identify the food item or dish. List the identified ingredients/items. Estimate the macro nutrition values (Calories/kCal, Protein in grams, Carbs in grams, Fats in grams) as accurately as possible. Also provide a brief health/recovery analysis aligned with sport and biometrics advice.",
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foodName: {
              type: Type.STRING,
              description: "The primary name or description of the identified meal/dish.",
            },
            identifiedItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of ingredients, foods, or components identified in the image.",
            },
            estimatedKcal: {
              type: Type.INTEGER,
              description: "The estimated calories or energy value of the meal in kCal.",
            },
            proteinG: {
              type: Type.INTEGER,
              description: "Estimated protein content in grams.",
            },
            carbsG: {
              type: Type.INTEGER,
              description: "Estimated carbohydrates content in grams.",
            },
            fatG: {
              type: Type.INTEGER,
              description: "Estimated fat content in grams.",
            },
            analysis: {
              type: Type.STRING,
              description: "A brief professional analysis of how this meal fits a recovery or hypertrophic fitness protocol.",
            },
          },
          required: ["foodName", "identifiedItems", "estimatedKcal", "proteinG", "carbsG", "fatG", "analysis"],
        },
      },
    });

    const resultText = response.text || "{}";
    res.json(JSON.parse(resultText));
  } catch (error: any) {
    console.error("Meal analysis error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze meal image." });
  }
});

// AI Reselling Product Analysis & Extractor
app.post("/api/analyze-product", async (req, res) => {
  try {
    const { image, textQuery } = req.body;
    const ai = getAI();

    let parts: any[] = [];

    if (image) {
      let base64Data = "";
      let mimeType = "image/jpeg";

      if (image.includes(";base64,")) {
        const partsSplit = image.split(";base64,");
        mimeType = partsSplit[0].replace(/^data:/, "");
        base64Data = partsSplit[1];
      } else {
        base64Data = image;
      }

      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    const textPartPrompt = textQuery 
      ? `Information context about this reseller item: "${textQuery}". Extract product descriptors and predict estimated market prices.`
      : `Scan this reseller item photo. Determine brand, model name, category, physical condition, average wholesale buy cost, average fair eBay retail selling price, confidence estimation rate, and bullet points of key product details.`;

    parts.push({ text: textPartPrompt });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts },
      config: {
        systemInstruction: `You are a high-speed laser e-commerce reselling and cross-listing master. You analyze vintage streetwear, collectibles, electronics, and rare designer pieces.
Identify the item as accurately as possible. Output your estimation in strict JSON conformant structure. Set prices in reasonable USD ranges.
Ensure category is one of: "Apparel", "Footwear", "Electronics", "Toys & Games", "Home & Kitchen", "Books", "Other".
Ensure condition is one of: "New With Tags (NWT)", "New Without Tags (NWOT)", "Excellent Used Condition (EUC)", "Good Used Condition (GUC)", "Fair Condition".`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A high-conversion SEO title containing relevant search keywords for reselling channels" },
            brand: { type: Type.STRING },
            model: { type: Type.STRING, description: "Specific style number or model reference if available" },
            category: { type: Type.STRING, description: "One of standard categories in strict capitalization" },
            condition: { type: Type.STRING, description: "One of standard condition formats" },
            buyCost: { type: Type.INTEGER, description: "Reasonable thrift / sourcing cost of this item in USD" },
            suggestedPrice: { type: Type.INTEGER, description: "Estimated average listed price on reselling channels in USD" },
            confidenceScore: { type: Type.INTEGER, description: "Certainty percentage (0-100)" },
            notes: { type: Type.STRING, description: "A couple of bullet points of product attributes including fabric or features" }
          },
          required: ["title", "brand", "category", "condition", "buyCost", "suggestedPrice", "confidenceScore", "notes"]
        }
      }
    });

    const resultText = response.text || "{}";
    res.json(JSON.parse(resultText));
  } catch (error: any) {
    console.error("Product analysis error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze product." });
  }
});

// AI fitness coach endpoint
app.post("/api/coach", async (req, res) => {
  try {
    const { messages, userProfile, statsSummary } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages array provided." });
    }

    const ai = getAI();

    // Context instruction giving the coach persona and injecting user stats summary if available
    const statsCtx = statsSummary 
      ? `Here are the user's recent fitness statistics to help personalize your advice: \n${statsSummary}`
      : "No fitness statistics logged yet.";

    const profileCtx = userProfile
      ? `User Profile:\n- Name: ${userProfile.name || "User"}\n- Goal: ${userProfile.goal || "Stay fit"}\n- Level: ${userProfile.experience || "Beginner"}\n- Age/Weight/Height: ${userProfile.age || "N/A"} years, ${userProfile.weight || "N/A"} kg, ${userProfile.height || "N/A"} cm.`
      : "User Profile is not formulated yet.";

    const systemInstruction = `You are a certified professional personal fitness trainer and health coach. Your goal is to guide, motivate, and plan workouts or nutrition advice for the user based on their goals and logs.
Keep your answers highly practical, concise, supportive, and action-oriented. Refrain from long generic statements. Format your recommendations in clean Markdown with bold bullet points where appropriate.

${profileCtx}

${statsCtx}`;

    // Reconstruct conversation messages for the Gemini API
    // We send a single prompt merging context if chat is single-shot, or pass contents
    // Let's translate messages to contents format for GoogleGenAI:
    // { role: 'user' | 'model', parts: [{ text: '' }] }
    const contents = messages.map((m: { role: string; content: string }) => {
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      };
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ message: response.text });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: error.message || "Failed to communicate with AI Coach" });
  }
});

// Configure Vite or Static files depending on Environment
async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite proxy...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully active on http://0.0.0.0:${PORT}`);
  });
}

setupViteOrStatic().catch((err) => {
  console.error("Failed to initialize server:", err);
});
