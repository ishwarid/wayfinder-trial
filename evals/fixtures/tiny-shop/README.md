# Tiny Shop

A small online store API for a homewares business. It lists products, keeps a cart per
session, applies discounts and takes payment at checkout.

## Running it

```bash
npm install
npm run dev
```

The API listens on port 4000. Payments go to a sandbox gateway unless `PAYMENTS_LIVE=true`.

## Main endpoints

- `GET /products` lists products
- `POST /cart/items` adds an item to the cart
- `POST /checkout` turns the cart into an order and charges the customer
