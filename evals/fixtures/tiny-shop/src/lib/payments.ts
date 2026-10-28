import { PAYMENTS_LIVE } from "../../config/settings";

export type ChargeResult = { ok: true; chargeId: string } | { ok: false; reason: string };

/** Charges a tokenised card through the payment gateway. */
export async function chargeCard(cardToken: string, amountCents: number): Promise<ChargeResult> {
  if (!cardToken) return { ok: false, reason: "missing card" };

  // HACK: retry once on timeout because the sandbox gateway is flaky
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await sendToGateway(cardToken, amountCents);
    } catch (error) {
      if (attempt === 2) return { ok: false, reason: String(error) };
    }
  }
  return { ok: false, reason: "unreachable" };
}

async function sendToGateway(cardToken: string, amountCents: number): Promise<ChargeResult> {
  const host = PAYMENTS_LIVE ? "https://pay.example.com" : "https://sandbox.pay.example.com";
  const response = await fetch(`${host}/charges`, {
    method: "POST",
    body: JSON.stringify({ cardToken, amountCents }),
  });
  if (!response.ok) return { ok: false, reason: `gateway returned ${response.status}` };
  const data = (await response.json()) as { id: string };
  return { ok: true, chargeId: data.id };
}
