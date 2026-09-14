import { describe, it, expect } from "vitest";
import { games, getGameBySlug } from "@/games/registry";

describe("Game registry", () => {
  it("contains the WHY? game", () => {
    const why = games.find((g) => g.slug === "why");
    expect(why).toBeDefined();
    expect(why?.title).toBe("WHY?");
    expect(why?.path).toBe("/why");
    expect(why?.description).toBe("Find a reason the AI can't argue against.");
  });

  it("getGameBySlug returns the game by slug", () => {
    expect(getGameBySlug("why")?.slug).toBe("why");
  });

  it("getGameBySlug returns undefined for unknown slug", () => {
    expect(getGameBySlug("nonexistent")).toBeUndefined();
  });

  it("every game has a unique slug", () => {
    const slugs = games.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every game has a unique path", () => {
    const paths = games.map((g) => g.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
