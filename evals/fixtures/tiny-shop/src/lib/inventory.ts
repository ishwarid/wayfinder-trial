export type Product = { id: string; name: string; priceCents: number; stock: number };

const PRODUCTS: Product[] = [
  { id: "mug", name: "Stoneware mug", priceCents: 2_400, stock: 40 },
  { id: "throw", name: "Wool throw", priceCents: 8_900, stock: 12 },
  { id: "lamp", name: "Brass desk lamp", priceCents: 14_500, stock: 5 },
];

export function listProducts() {
  return PRODUCTS.filter((product) => product.stock > 0);
}

export function findProduct(id: string) {
  // XXX: doesn't reserve stock, so two carts can buy the last lamp
  return PRODUCTS.find((product) => product.id === id);
}
