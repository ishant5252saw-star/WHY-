import { test, expect, type Page, type Route } from "@playwright/test";

const API_URL = /\/functions\/v1\/why-game/;

function mockApiResponse(fulfill: (url: string, body: unknown, status?: number) => void) {
  return (route: Route) => {
    const url = route.request().url();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    fulfill(url, body, undefined);
  };
}

test.describe("WHY? game", () => {
  test("homepage renders with game library", async ({ page }: Page) => {
    await page.goto("/");

    await expect(page.locator("h1")).toContainText("experiments");
    await expect(page.getByText("WHY?")).toBeVisible();
    await expect(page.getByText("Find a reason the AI can't argue against.")).toBeVisible();
  });

  test("WHY? page renders with objective input", async ({ page }: Page) => {
    await page.goto("/why");

    await expect(page.getByRole("heading", { name: "WHY?" })).toBeVisible();
    await expect(page.getByText("What are you supposed to be doing?")).toBeVisible();
    await expect(page.getByPlaceholder("I should study chemistry.")).toBeVisible();
  });

  test("user can start a game", async ({ page }: Page) => {
    await page.route(API_URL, (route) => {
      const url = route.request().url();
      if (url.endsWith("/game") && route.request().method() === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            game_id: "test-game-id",
            session_token: "test-token",
            objective: "I should study chemistry.",
            message: {
              role: "assistant",
              content: "You're too tired to study effectively.",
              argument_category: "fatigue",
              argument_strength: 70,
              status: "continue",
              used_previous_knowledge: false,
            },
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/why");

    const input = page.getByPlaceholder("I should study chemistry.");
    await input.fill("I should study chemistry.");
    await input.press("Enter");

    await expect(page.getByText("You're too tired to study effectively.")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("I should study chemistry.")).toBeVisible();
  });

  test("user can send a counterargument", async ({ page }: Page) => {
    let messageCount = 0;

    await page.route(API_URL, (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.endsWith("/game") && method === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            game_id: "test-game-id",
            session_token: "test-token",
            objective: "I should study chemistry.",
            message: {
              role: "assistant",
              content: "You're too tired to study effectively.",
              argument_category: "fatigue",
              argument_strength: 70,
              status: "continue",
              used_previous_knowledge: false,
            },
          }),
        });
      } else if (url.includes("/message") && method === "POST") {
        messageCount++;
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            message: {
              role: "assistant",
              content: "That establishes duration, not quality of sleep.",
              argument_category: "quality",
              argument_strength: 65,
              status: "continue",
              used_previous_knowledge: false,
            },
            game_status: "active",
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/why");

    const objectiveInput = page.getByPlaceholder("I should study chemistry.");
    await objectiveInput.fill("I should study chemistry.");
    await objectiveInput.press("Enter");

    await expect(page.getByText("You're too tired to study effectively.")).toBeVisible({ timeout: 10000 });

    const counterInput = page.getByPlaceholder("your counterargument...");
    await counterInput.fill("I slept 9 hours.");
    await counterInput.press("Enter");

    await expect(page.getByText("That establishes duration, not quality of sleep.")).toBeVisible({ timeout: 10000 });
    expect(messageCount).toBe(1);
  });

  test("win state displays when AI is defeated", async ({ page }: Page) => {
    await page.route(API_URL, (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.endsWith("/game") && method === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            game_id: "test-game-id",
            session_token: "test-token",
            objective: "I should study chemistry.",
            message: {
              role: "assistant",
              content: "You're too tired.",
              argument_category: "fatigue",
              argument_strength: 70,
              status: "continue",
              used_previous_knowledge: false,
            },
          }),
        });
      } else if (url.includes("/message") && method === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            message: {
              role: "assistant",
              content: "Fine. You actually closed every avenue. You win this one.",
              argument_category: "concession",
              argument_strength: 0,
              status: "defeated",
              used_previous_knowledge: false,
            },
            game_status: "won",
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/why");

    await page.getByPlaceholder("I should study chemistry.").fill("I should study chemistry.");
    await page.getByPlaceholder("I should study chemistry.").press("Enter");

    await expect(page.getByText("You're too tired.")).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("your counterargument...").fill("I am already in the exam hall.");
    await page.getByPlaceholder("your counterargument...").press("Enter");

    await expect(page.getByText("You win.")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Fine. You actually closed every avenue. You win this one.")).toBeVisible();
    await expect(page.getByText("play again")).toBeVisible();
    await expect(page.getByText("return home")).toBeVisible();
  });

  test("keyboard interaction works (Enter to submit)", async ({ page }: Page) => {
    await page.route(API_URL, (route) => {
      if (route.request().url().endsWith("/game")) {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            game_id: "test-game-id",
            session_token: "test-token",
            objective: "I should run.",
            message: {
              role: "assistant",
              content: "Running is bad for your knees.",
              argument_category: "health",
              argument_strength: 60,
              status: "continue",
              used_previous_knowledge: false,
            },
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/why");

    const input = page.getByPlaceholder("I should study chemistry.");
    await input.focus();
    await page.keyboard.type("I should run.");
    await page.keyboard.press("Enter");

    await expect(page.getByText("Running is bad for your knees.")).toBeVisible({ timeout: 10000 });
  });

  test("loading state shows while waiting for AI", async ({ page }: Page) => {
    await page.route(API_URL, async (route) => {
      if (route.request().url().endsWith("/game")) {
        await new Promise((r) => setTimeout(r, 500));
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            game_id: "test-game-id",
            session_token: "test-token",
            objective: "I should study.",
            message: {
              role: "assistant",
              content: "Why bother?",
              argument_category: "necessity",
              argument_strength: 50,
              status: "continue",
              used_previous_knowledge: false,
            },
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/why");
    await page.getByPlaceholder("I should study chemistry.").fill("I should study.");
    await page.getByText("begin").click();

    await expect(page.getByText("starting...")).toBeVisible();
    await expect(page.getByText("Why bother?")).toBeVisible({ timeout: 10000 });
  });

  test("error state shows on AI failure", async ({ page }: Page) => {
    await page.route(API_URL, (route) => {
      if (route.request().url().endsWith("/game")) {
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "The AI is not responding." }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/why");
    await page.getByPlaceholder("I should study chemistry.").fill("I should study.");
    await page.getByText("begin").click();

    await expect(page.getByText("The AI is not responding.")).toBeVisible({ timeout: 10000 });
  });

  test("mobile layout works", async ({ page }: Page) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.route(API_URL, (route) => {
      if (route.request().url().endsWith("/game")) {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            game_id: "test-game-id",
            session_token: "test-token",
            objective: "I should study chemistry.",
            message: {
              role: "assistant",
              content: "You're too tired.",
              argument_category: "fatigue",
              argument_strength: 70,
              status: "continue",
              used_previous_knowledge: false,
            },
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/why");

    const input = page.getByPlaceholder("I should study chemistry.");
    await input.fill("I should study chemistry.");
    await input.press("Enter");

    await expect(page.getByText("You're too tired.")).toBeVisible({ timeout: 10000 });

    // Input should be accessible on mobile
    const counterInput = page.getByPlaceholder("your counterargument...");
    await expect(counterInput).toBeVisible();
    await counterInput.fill("I slept well.");
    await counterInput.press("Enter");
  });

  test("back link returns to homepage", async ({ page }: Page) => {
    await page.goto("/why");
    await page.getByText("back").click();
    await expect(page).toHaveURL("/");
  });
});
