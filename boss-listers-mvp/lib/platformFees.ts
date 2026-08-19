import { ResellerProduct, PlatformName, ResellerStats, SyncLogEntry } from "./types";

const todayStr = (offset: number = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().split("T")[0];
};

export const INITIAL_PRODUCTS: ResellerProduct[] = [
  {
    id: "prod-1",
    title: "Air Jordan 1 Retro High 'Shadow' 2018",
    brand: "Nike Jordan",
    model: "555088-013",
    skuCode: "Jordan-Shadow-18",
    category: "Footwear",
    condition: "Excellent Used Condition (EUC)",
    notes: "No box, slight heel drag. Cleaned midsole and deodorized interior. Leather is in supreme condition.",
    buyCost: 65,
    suggestedPrice: 210,
    confidenceScore: 92,
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    status: "Listed",
    platforms: {
      ebay: { listed: true, listedPrice: 210, listedUrl: "https://www.ebay.com/itm/324838", syncStatus: "success", syncedAt: todayStr(4), syncLog: "Successfully queued and matching eBay sneakers payout schedule." },
      poshmark: { listed: true, listedPrice: 220, listedUrl: "https://poshmark.com/listing/jordan-retro-67", syncStatus: "success", syncedAt: todayStr(4), syncLog: "Listed with premium shipping default configuration." },
      mercari: { listed: false, listedPrice: 210, syncStatus: "idle" },
      depop: { listed: true, listedPrice: 210, listedUrl: "https://depop.com/item/jordan-retro-67", syncStatus: "success", syncedAt: todayStr(4), syncLog: "Successfully synced to Depop storefront." },
      grailed: { listed: false, listedPrice: 210, syncStatus: "idle" },
      etsy: { listed: false, listedPrice: 210, syncStatus: "idle" },
      shopify: { listed: false, listedPrice: 210, syncStatus: "idle" },
      tiktok: { listed: false, listedPrice: 210, syncStatus: "idle" }
    },
    createdAt: todayStr(5)
  },
  {
    id: "prod-2",
    title: "Patagonia Synchilla Fleece Snap-T Pullover",
    brand: "Patagonia",
    model: "Synchilla Regular Fit",
    skuCode: "Patagonia-Sync-Blk",
    category: "Apparel",
    condition: "Good Used Condition (GUC)",
    notes: "Vintage 2016 black/oatmeal fleece. Minor pilling near elbow cuffs. Snap closures work perfect.",
    buyCost: 12,
    suggestedPrice: 55,
    confidenceScore: 88,
    imageUrl: "https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    status: "Listed",
    platforms: {
      ebay: { listed: true, listedPrice: 55, listedUrl: "https://www.ebay.com/itm/984725", syncStatus: "success", syncedAt: todayStr(1), syncLog: "Listed in Men's Casual Tops category." },
      poshmark: { listed: true, listedPrice: 60, listedUrl: "https://poshmark.com/listing/patagonia-78", syncStatus: "success", syncedAt: todayStr(1), syncLog: "Successfully synced with closet sharing tags." },
      mercari: { listed: true, listedPrice: 50, listedUrl: "https://www.mercari.com/us/item/7625", syncStatus: "success", syncedAt: todayStr(1), syncLog: "Listed and opted in to Smart Pricing drops." },
      depop: { listed: false, listedPrice: 55, syncStatus: "idle" },
      grailed: { listed: false, listedPrice: 55, syncStatus: "idle" },
      etsy: { listed: false, listedPrice: 55, syncStatus: "idle" },
      shopify: { listed: false, listedPrice: 55, syncStatus: "idle" },
      tiktok: { listed: false, listedPrice: 55, syncStatus: "idle" }
    },
    createdAt: todayStr(2)
  },
  {
    id: "prod-3",
    title: "Apple iPad Air 4th Gen 64GB Space Gray",
    brand: "Apple",
    model: "MYFM2LL/A (A2316)",
    skuCode: "iPad-Air4-Space",
    category: "Electronics",
    condition: "New Without Tags (NWOT)",
    notes: "Open box, still has blue plastic wrap. Included third-party charger adaptor. Factory reset and fully tested 100% battery capacity.",
    buyCost: 180,
    suggestedPrice: 380,
    confidenceScore: 97,
    imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    status: "Sold",
    soldPrice: 365,
    soldDate: todayStr(1),
    shippingCharged: 12,
    shippingCost: 8.5,
    platformFeesPaid: 48.36, // ebay fee
    platforms: {
      ebay: { listed: true, listedPrice: 380, listedUrl: "https://www.ebay.com/itm/552914", syncStatus: "success", syncedAt: todayStr(3), syncLog: "Item marked sold on eBay channel. Automated sync locked." },
      poshmark: { listed: false, listedPrice: 380, syncStatus: "idle" },
      mercari: { listed: false, listedPrice: 380, syncStatus: "idle" },
      depop: { listed: false, listedPrice: 380, syncStatus: "idle" },
      grailed: { listed: false, listedPrice: 380, syncStatus: "idle" },
      etsy: { listed: false, listedPrice: 380, syncStatus: "idle" },
      shopify: { listed: false, listedPrice: 380, syncStatus: "idle" },
      tiktok: { listed: false, listedPrice: 380, syncStatus: "idle" }
    },
    createdAt: todayStr(4)
  },
  {
    id: "prod-4",
    title: "Legend of Zelda: Tears of the Kingdom (Nintendo Switch)",
    brand: "Nintendo",
    model: "Switch Cartridge Physical",
    skuCode: "Zelda-Totk-NS",
    category: "Toys & Games",
    condition: "New With Tags (NWT)",
    notes: "Brand new original factory fold wrapping. Pristine case, ready for collectors or gamers.",
    buyCost: 25,
    suggestedPrice: 48,
    confidenceScore: 99,
    imageUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    status: "Draft",
    platforms: {
      ebay: { listed: false, listedPrice: 48, syncStatus: "idle" },
      poshmark: { listed: false, listedPrice: 48, syncStatus: "idle" },
      mercari: { listed: false, listedPrice: 48, syncStatus: "idle" },
      depop: { listed: false, listedPrice: 48, syncStatus: "idle" },
      grailed: { listed: false, listedPrice: 48, syncStatus: "idle" },
      etsy: { listed: false, listedPrice: 48, syncStatus: "idle" },
      shopify: { listed: false, listedPrice: 48, syncStatus: "idle" },
      tiktok: { listed: false, listedPrice: 48, syncStatus: "idle" }
    },
    createdAt: todayStr(0)
  }
];

export const INITIAL_SYNC_LOGS: SyncLogEntry[] = [
  {
    id: "log-1",
    productId: "prod-1",
    productTitle: "Air Jordan 1 Retro High 'Shadow' 2018",
    platform: "ebay",
    status: "success",
    message: "eBay API returned Active Item Identifier: 2356192837. Listing is live.",
    timestamp: todayStr(4) + " 14:22"
  },
  {
    id: "log-2",
    productId: "prod-1",
    productTitle: "Air Jordan 1 Retro High 'Shadow' 2018",
    platform: "poshmark",
    status: "success",
    message: "Cross-listed to Poshmark closet 'bossseller_resells'. Added tags: retro, sneakers, jordan.",
    timestamp: todayStr(4) + " 14:24"
  },
  {
    id: "log-3",
    productId: "prod-2",
    productTitle: "Patagonia Synchilla Fleece Snap-T Pullover",
    platform: "ebay",
    status: "success",
    message: "Synced item attributes: Men's Fleece Tops category mapped successfully.",
    timestamp: todayStr(1) + " 09:12"
  },
  {
    id: "log-4",
    productId: "prod-2",
    productTitle: "Patagonia Synchilla Fleece Snap-T Pullover",
    platform: "mercari",
    status: "success",
    message: "Mercari sync successful! Pricing floor set at $35 to match multi-plat drops.",
    timestamp: todayStr(1) + " 09:15"
  },
  {
    id: "log-5",
    productId: "prod-3",
    productTitle: "Apple iPad Air 4th Gen 64GB Space Gray",
    platform: "poshmark",
    status: "info",
    message: "Disabling Poshmark listing: Item detected sold on eBay parent channel.",
    timestamp: todayStr(1) + " 18:44"
  }
];

export const calculateProductProfit = (
  price: number,
  buyCost: number,
  platform: PlatformName,
  estShippingCost: number = 0,
  shippingCharged: number = 0
): { platformFee: number; netProfit: number; marginPercent: number } => {
  let platformFee = 0;
  
  if (platform === "ebay") {
    // Standard eBay rate: 13.25% + $0.30 fixed
    platformFee = (price + shippingCharged) * 0.1325 + 0.30;
  } else if (platform === "poshmark") {
    // Poshmark: 20% flat commission (minimum $2.95 for sales under $15)
    if (price < 15) {
      platformFee = 2.95;
    } else {
      platformFee = price * 0.20;
    }
  } else if (platform === "mercari") {
    // Mercari: 10% selling fee + 2.9% + 0.50 payment processing
    platformFee = price * 0.10 + (price * 0.029 + 0.50);
  } else if (platform === "depop") {
    // Depop: 10% fee + 3.3% + 0.45 transaction
    platformFee = price * 0.10 + (price * 0.033 + 0.45);
  } else if (platform === "grailed") {
    // Grailed: 9% fee + 3.49% + 0.49 payment
    platformFee = price * 0.09 + (price * 0.0349 + 0.49);
  } else if (platform === "etsy") {
    // Etsy: 6.5% transaction + 3% + 0.25 payment processing
    platformFee = price * 0.065 + (price * 0.03 + 0.25);
  } else if (platform === "shopify") {
    // Shopify: 2.9% + 0.30 gateway
    platformFee = price * 0.029 + 0.30;
  } else if (platform === "tiktok") {
    // TikTok Shop: 8% flat seller fee + $0.30 payment processing
    platformFee = price * 0.08 + 0.30;
  }

  // Rounded decimal safety
  platformFee = Math.round(platformFee * 100) / 100;

  const totalRevenue = price + shippingCharged;
  const totalExpenses = buyCost + platformFee + estShippingCost;
  const netProfit = Math.round((totalRevenue - totalExpenses) * 100) / 100;
  
  const marginPercent = price > 0 ? Math.round((netProfit / price) * 100) : 0;

  return {
    platformFee,
    netProfit,
    marginPercent
  };
};

export const calculateStats = (products: ResellerProduct[]): ResellerStats => {
  let totalItems = products.length;
  let totalListedValue = 0;
  let totalInvestedCost = 0;
  let projectedProfit = 0;
  let realizedProfit = 0;
  let soldCount = 0;
  let activeCount = 0;
  let draftCount = 0;

  products.forEach((p) => {
    totalInvestedCost += p.buyCost;

    if (p.status === "Sold") {
      soldCount++;
      const rev = p.soldPrice || p.suggestedPrice;
      const shipRev = p.shippingCharged || 0;
      const shipExp = p.shippingCost || 0;
      const fees = p.platformFeesPaid || (rev * 0.1325 + 0.30); // Default fallback to eBay standard
      
      realizedProfit += (rev + shipRev) - (p.buyCost + shipExp + fees);
    } else if (p.status === "Listed") {
      activeCount++;
      totalListedValue += p.suggestedPrice;
      
      // Calculate projected using standard eBay fallback
      const { netProfit } = calculateProductProfit(p.suggestedPrice, p.buyCost, "ebay");
      projectedProfit += netProfit;
    } else {
      draftCount++;
    }
  });

  const totalProfitPool = realizedProfit + projectedProfit;
  const denominator = totalListedValue + (products.filter(p => p.status === "Sold").reduce((acc, current) => acc + (current.soldPrice || 0), 0));
  const averageMargin = denominator > 0 ? Math.round((totalProfitPool / denominator) * 100) : 0;

  return {
    totalItems,
    totalListedValue,
    totalInvestedCost,
    projectedProfit: Math.round(projectedProfit * 100) / 100,
    realizedProfit: Math.round(realizedProfit * 100) / 100,
    averageMargin,
    soldCount,
    activeCount,
    draftCount
  };
};

export const getBrandTemplateImage = (category: string, brand: string): string => {
  const brandName = brand.toLowerCase();
  
  if (category === "Footwear") {
    return "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=60"; // Red Sneakers
  }
  if (category === "Electronics") {
    return "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&auto=format&fit=crop&q=60"; // Tablet
  }
  if (category === "Apparel") {
    if (brandName.includes("patagonia") || brandName.includes("north face")) {
      return "https://images.unsplash.com/photo-1593030103066-0093718efeb9?w=400&auto=format&fit=crop&q=60"; // Hanger / Outdoor jacket
    }
    return "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&auto=format&fit=crop&q=60"; // Styled Clothes
  }
  if (category === "Toys & Games") {
    return "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&auto=format&fit=crop&q=60"; // Retro gamer room
  }
  if (category === "Books") {
    return "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&auto=format&fit=crop&q=60"; // Book stack
  }
  
  // Default placeholder
  return "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=400&auto=format&fit=crop&q=60";
};
