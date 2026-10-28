import express from "express";
import { cartRouter } from "./routes/cart";
import { checkoutRouter } from "./routes/checkout";
import { productsRouter } from "./routes/products";

const app = express();
app.use(express.json());

app.use("/products", productsRouter);
app.use("/cart", cartRouter);
app.use("/checkout", checkoutRouter);

// TODO: add rate limiting before launch
app.listen(4000, () => {
  console.log("Tiny Shop API listening on port 4000");
});
