import { Router } from "express";
import { listProducts } from "../lib/inventory";

export const productsRouter = Router();

productsRouter.get("/", (_req, res) => {
  res.json({ products: listProducts() });
});
