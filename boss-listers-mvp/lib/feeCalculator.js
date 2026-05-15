// lib/feeCalculator.js

function estimateShippingCost(weightLb) {
  const w = weightLb || 1;
  if (w <= 0.5) return 4.5;
  if (w <= 1) return 6.0;
  if (w <= 2) return 8.5;
  if (w <= 5) return 12.0;
  return 12.0 + 1.6 * Math.ceil(w - 5);
}

function computeFees({ marketplace, salePrice, weightLb }) {
  const price = Math.max(0, salePrice || 0);
  const weight = weightLb || 1;
  let rate = 0.12;
  let fixed = 0.3;

  if (marketplace === "poshmark") {
    rate = 0.2;
    fixed = 0;
  }
  if (marketplace === "ebay") {
    rate = 0.1325;
    fixed = 0.3;
  }
  if (marketplace === "mercari") {
    rate = 0.129;
    fixed = 0.5;
  }
  if (marketplace === "depop") {
    rate = 0.133;
    fixed = 0.45;
  }
  if (marketplace === "facebook") {
    rate = 0.05;
    fixed = 0.4;
  }
  if (marketplace === "etsy") {
    rate = 0.095;
    fixed = 0.45;
  }
  if (marketplace === "tiktok") {
    rate = 0.08;
    fixed = 0.3;
  }
  if (marketplace === "offerup") {
    rate = 0.129;
    fixed = 0;
  }

  const selling = +(price * rate + fixed).toFixed(2);
  const shipping = +estimateShippingCost(weight).toFixed(2);

  return {
    marketplace,
    referralFee: selling,
    paymentFee: 0,
    fulfillmentFee: 0,
    shippingCost: shipping,
    otherFees: 0,
    totalFees: +(selling + shipping).toFixed(2)
  };
}

function computeProfit({ marketplace, salePrice, costOfGoods, weightLb }) {
  const cost = Math.max(0, costOfGoods || 0);
  const fees = computeFees({ marketplace, salePrice, weightLb });
  const netRevenue = +(salePrice - fees.totalFees).toFixed(2);
  const netProfit = +(netRevenue - cost).toFixed(2);
  const marginPct = salePrice > 0 ? +(((netProfit / salePrice) * 100).toFixed(1)) : 0;
  const roiPct = cost > 0 ? +(((netProfit / cost) * 100).toFixed(1)) : 0;
  return {
    marketplace,
    salePrice,
    costOfGoods: cost,
    fees,
    netRevenue,
    netProfit,
    marginPct,
    roiPct
  };
}

module.exports = { computeFees, computeProfit };
