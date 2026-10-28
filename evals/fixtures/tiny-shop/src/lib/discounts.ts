import type { CartItem } from "../routes/cart";

export type AppliedDiscount = { name: string; amountCents: number };

const CODES: Record<string, { percent: number; minimumCents: number }> = {
  SAVE10: { percent: 10, minimumCents: 5_000 },
  WELCOME15: { percent: 15, minimumCents: 0 },
};

/**
 * Business rules for discounts, applied in this order:
 * - a discount code (SAVE10 needs a $50 subtotal; WELCOME15 has no minimum)
 * - a bulk discount of 5% when the cart has 10 or more items
 * - a members' discount of 5%, which can't be combined with a code
 */
export function applyDiscounts(
  subtotalCents: number,
  items: CartItem[],
  options: { code?: string; isMember: boolean },
) {
  const applied: AppliedDiscount[] = [];
  let totalCents = subtotalCents;

  const code = options.code ? CODES[options.code.toUpperCase()] : undefined;
  if (code && subtotalCents >= code.minimumCents) {
    const amountCents = Math.round((totalCents * code.percent) / 100);
    applied.push({ name: `Code ${options.code!.toUpperCase()}`, amountCents });
    totalCents -= amountCents;
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  if (itemCount >= 10) {
    // FIXME: rounding is wrong for 3-for-2 deals; we round per order, not per line
    const amountCents = Math.round(totalCents * 0.05);
    applied.push({ name: "Bulk discount", amountCents });
    totalCents -= amountCents;
  }

  if (options.isMember && !code) {
    const amountCents = Math.round(totalCents * 0.05);
    applied.push({ name: "Members' discount", amountCents });
    totalCents -= amountCents;
  }

  return { totalCents, applied };
}
