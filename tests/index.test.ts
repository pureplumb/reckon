import { test, expect } from "bun:test";
import { greet } from "@/index";

test("greet", () => {
  expect(greet("Bun")).toBe("Hello, Bun!");
});
