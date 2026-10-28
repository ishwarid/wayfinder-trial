import { Router } from "express";
import { z } from "zod";
import { findProduct } from "../lib/inventory";

export type CartItem = { productId: string; quantity: number; unitPriceCents: number };

// One cart per session id. Lost on restart.
// TODO: move carts to Redis so they survive deploys
export const carts = new Map<string, CartItem[]>();

const AddItem = z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20) });

export const cartRouter = Router();

cartRouter.post("/items", (req, res) => {
  const sessionId = String(req.headers["x-session-id"] ?? "");
  const parsed = AddItem.safeParse(req.body);
  if (!sessionId || !parsed.success) return res.status(400).json({ error: "invalid request" });

  const product = findProduct(parsed.data.productId);
  if (!product) return res.status(404).json({ error: "unknown product" });

  const items = carts.get(sessionId) ?? [];
  items.push({ ...parsed.data, unitPriceCents: product.priceCents });
  carts.set(sessionId, items);
  res.status(201).json({ items });
});
