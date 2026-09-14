import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the env before importing api
vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");

import { createGame, sendMessage, getGame } from "@/lib/api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => data,
  };
}

describe("API client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("createGame sends POST to /game with objective", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        game_id: "g1",
        session_token: "tok1",
        objective: "study chemistry",
        message: { role: "assistant", content: "Why bother?" },
      }),
    );

    const result = await createGame("study chemistry");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test.supabase.co/functions/v1/why-game/game");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ objective: "study chemistry" });
    expect(result.game_id).toBe("g1");
    expect(result.session_token).toBe("tok1");
  });

  it("createGame throws on empty objective", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: "Objective is required" }, false),
    );

    await expect(createGame("")).rejects.toThrow("Objective is required");
  });

  it("sendMessage sends POST to /:gameId/message", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        message: { role: "assistant", content: "Nice try." },
        game_status: "active",
      }),
    );

    const result = await sendMessage("g1", "tok1", "I slept 9 hours");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test.supabase.co/functions/v1/why-game/g1/message");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      content: "I slept 9 hours",
      session_token: "tok1",
    });
    expect(result.game_status).toBe("active");
  });

  it("sendMessage detects won status", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        message: { role: "assistant", content: "Fine. You win." },
        game_status: "won",
      }),
    );

    const result = await sendMessage("g1", "tok1", "irrefutable");
    expect(result.game_status).toBe("won");
  });

  it("getGame sends GET with session_token query param", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        game: { id: "g1", objective: "study", status: "active", turn_count: 3, created_at: "2026-01-01" },
        messages: [{ role: "assistant", content: "hi" }],
      }),
    );

    const result = await getGame("g1", "tok1");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("session_token=tok1");
    expect(result.game.objective).toBe("study");
    expect(result.messages).toHaveLength(1);
  });

  it("throws on non-ok response with error message", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: "Rate limited" }, false),
    );

    await expect(sendMessage("g1", "tok1", "test")).rejects.toThrow("Rate limited");
  });

  it("throws on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(createGame("test")).rejects.toThrow("Network error");
  });
});
