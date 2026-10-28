import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when test globals are on. We keep them off
// (explicit imports read better), so unmount between tests ourselves.
afterEach(() => {
  cleanup();
});
