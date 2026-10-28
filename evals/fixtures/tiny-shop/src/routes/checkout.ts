import { Router } from "express";
import { applyDiscounts } from "../lib/discounts";
import { createOrder } from "../lib/orders";
import { chargeCard } from "../lib/payments";
import { calculateShipping } from "../lib/shipping";
import { carts } from "./cart";

export const checkoutRouter = Router();

/**
 * Checkout flow:
 * 1. load the session's cart
 * 2. apply discounts (codes, bulk, members)
 * 3. add shipping
 * 4. charge the card
 * 5. create the order and empty the cart
 */
checkoutRouter.post("/", async (req, res) => {
  const sessionId = String(req.headers["x-session-id"] ?? "");
  const items = carts.get(sessionId);
  if (!items?.length) return res.status(400).json({ error: "cart is empty" });

  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const { totalCents: discountedCents, applied } = applyDiscounts(subtotalCents, items, {
    code: req.body.discountCode,
    isMember: req.body.isMember === true,
  });
  const shippingCents = calculateShipping(discountedCents, req.body.shippingSpeed ?? "standard");
  const totalCents = discountedCents + shippingCents;

  // FIXME: if the charge succeeds but createOrder throws, the customer is charged with no order
  const charge = await chargeCard(req.body.cardToken, totalCents);
  if (!charge.ok) return res.status(402).json({ error: "payment declined" });

  const order = createOrder({ items, subtotalCents, discounts: applied, shippingCents, totalCents });
  carts.delete(sessionId);
  res.status(201).json({ order });
});
