import { lazy } from "react";

export interface GameDefinition {
  slug: string;
  title: string;
  description: string;
  path: string;
  component: React.LazyExoticComponent<React.ComponentType>;
}

const WhyGame = lazy(() => import("@/games/why/WhyGame"));

export const games: GameDefinition[] = [
  {
    slug: "why",
    title: "WHY?",
    description: "Find a reason the AI can't argue against.",
    path: "/why",
    component: WhyGame,
  },
];

export function getGameBySlug(slug: string): GameDefinition | undefined {
  return games.find((g) => g.slug === slug);
}
