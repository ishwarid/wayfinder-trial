/** Shared by the chat route (enforced) and the chat box (shown). */
export const MAX_MESSAGE_LENGTH = 2_000;
/** Only the most recent messages go to the model, to cap tokens. */
export const HISTORY_LIMIT = 8;

/** Who answers are written for. Product is plain language; developer cites code inline. */
export const AUDIENCES = ["product", "developer"] as const;
export type Audience = (typeof AUDIENCES)[number];
