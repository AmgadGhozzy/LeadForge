// ──────────────────────────────────────────────
// Health Score Weights
// ──────────────────────────────────────────────

export const healthWeights = {
  website: 25,
  phone: 20,
  rating: 10,
  reviews_gt_10: 10,
  reviews_gt_50: 5,
  address: 10,
  category: 10,
  coordinates: 10,
};

// Ensure total is 100
const total = Object.values(healthWeights).reduce((sum, weight) => sum + weight, 0);
if (total !== 100) {
  console.warn(`Health weights sum to ${total}, expected 100.`);
}
