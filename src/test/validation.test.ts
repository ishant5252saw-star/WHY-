import { describe, it, expect } from "vitest";

// These tests validate the same logic the edge function uses,
// replicated here for unit testing since the edge function runs in Deno.

function validateAIResponse(raw: unknown): {
  status: "continue" | "defeated";
  argument: string;
  reasoning_category: string;
  argument_strength: number;
  used_previous_knowledge: boolean;
} {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid AI response: not an object");
  }
  const obj = raw as Record<string, unknown>;

  const status = obj.status;
  if (status !== "continue" && status !== "defeated") {
    throw new Error("Invalid AI response: status must be 'continue' or 'defeated'");
  }

  const argument = obj.argument;
  if (typeof argument !== "string" || argument.trim().length === 0) {
    throw new Error("Invalid AI response: argument must be a non-empty string");
  }

  const reasoning_category =
    typeof obj.reasoning_category === "string" ? obj.reasoning_category : "unspecified";

  let argument_strength = 50;
  if (typeof obj.argument_strength === "number") {
    argument_strength = Math.max(0, Math.min(100, Math.round(obj.argument_strength)));
  }

  const used_previous_knowledge = obj.used_previous_knowledge === true;

  return {
    status,
    argument: argument.trim(),
    reasoning_category,
    argument_strength,
    used_previous_knowledge,
  };
}

const UNSAFE_PATTERNS = [
  /\bkill\s+(myself|yourself|himself|herself)\b/i,
  /\bsuicide\b/i,
  /\bself[\s-]?harm\b/i,
  /\boverdose\b/i,
  /\bweapons?\b/i,
];

function isUnsafeObjective(objective: string): boolean {
  return UNSAFE_PATTERNS.some((p) => p.test(objective));
}

describe("AI response validation", () => {
  it("accepts a valid continue response", () => {
    const result = validateAIResponse({
      status: "continue",
      argument: "You are too tired.",
      reasoning_category: "fatigue",
      argument_strength: 75,
      used_previous_knowledge: false,
    });
    expect(result.status).toBe("continue");
    expect(result.argument).toBe("You are too tired.");
    expect(result.argument_strength).toBe(75);
  });

  it("accepts a valid defeated response", () => {
    const result = validateAIResponse({
      status: "defeated",
      argument: "Fine. You win.",
      reasoning_category: "concession",
      argument_strength: 0,
      used_previous_knowledge: false,
    });
    expect(result.status).toBe("defeated");
  });

  it("rejects invalid status", () => {
    expect(() => validateAIResponse({ status: "maybe", argument: "x" })).toThrow();
  });

  it("rejects empty argument", () => {
    expect(() =>
      validateAIResponse({ status: "continue", argument: "  " }),
    ).toThrow("non-empty string");
  });

  it("rejects non-object input", () => {
    expect(() => validateAIResponse("string")).toThrow("not an object");
    expect(() => validateAIResponse(null)).toThrow("not an object");
    expect(() => validateAIResponse(42)).toThrow("not an object");
  });

  it("clamps argument_strength to 0-100", () => {
    const high = validateAIResponse({
      status: "continue",
      argument: "test",
      argument_strength: 999,
    });
    expect(high.argument_strength).toBe(100);

    const low = validateAIResponse({
      status: "continue",
      argument: "test",
      argument_strength: -50,
    });
    expect(low.argument_strength).toBe(0);
  });

  it("defaults argument_strength to 50 when missing", () => {
    const result = validateAIResponse({
      status: "continue",
      argument: "test",
    });
    expect(result.argument_strength).toBe(50);
  });

  it("defaults reasoning_category to unspecified", () => {
    const result = validateAIResponse({
      status: "continue",
      argument: "test",
    });
    expect(result.reasoning_category).toBe("unspecified");
  });

  it("defaults used_previous_knowledge to false", () => {
    const result = validateAIResponse({
      status: "continue",
      argument: "test",
    });
    expect(result.used_previous_knowledge).toBe(false);
  });
});

describe("Safety check", () => {
  it("flags self-harm objectives", () => {
    expect(isUnsafeObjective("I should kill myself")).toBe(true);
    expect(isUnsafeObjective("I want to self-harm")).toBe(true);
  });

  it("flags suicide references", () => {
    expect(isUnsafeObjective("I should commit suicide")).toBe(true);
  });

  it("flags weapons", () => {
    expect(isUnsafeObjective("I should buy weapons")).toBe(true);
  });

  it("does not flag benign objectives", () => {
    expect(isUnsafeObjective("I should study chemistry")).toBe(false);
    expect(isUnsafeObjective("I should clean my room")).toBe(false);
    expect(isUnsafeObjective("I should go for a run")).toBe(false);
    expect(isUnsafeObjective("I should sleep")).toBe(false);
  });
});
