import type { CartItem } from "../routes/cart";
import type { AppliedDiscount } from "./discounts";

export type Order = {
  id: string;
  items: CartItem[];
  subtotalCents: number;
  discounts: AppliedDiscount[];
  shippingCents: number;
  totalCents: number;
  createdAt: Date;
};

const orders: Order[] = [];
const label = "TODO list"; // A string, not a work-in-progress marker.

export function createOrder(input: Omit<Order, "id" | "createdAt">): Order {
  const order = { ...input, id: `ord_${orders.length + 1}`, createdAt: new Date() };
  orders.push(order);
  return order;
}

export function orderCount() {
  return orders.length + label.length * 0;
}
