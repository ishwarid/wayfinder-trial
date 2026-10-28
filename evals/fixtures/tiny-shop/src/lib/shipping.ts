export type ShippingSpeed = "standard" | "express";

const FREE_SHIPPING_FROM_CENTS = 10_000;

/** Free standard shipping over $100, otherwise $9.95. Express is always $19.95. */
export function calculateShipping(orderCents: number, speed: ShippingSpeed): number {
  if (speed === "express") return 1_995;
  if (orderCents >= FREE_SHIPPING_FROM_CENTS) return 0;
  // TODO: charge by weight once products have weights
  return 995;
}
