import { useState, useEffect, Suspense } from "react";
import Home from "@/pages/Home";
import { getGameBySlug } from "@/games/registry";

function useRoute(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <p className="text-6xl font-bold text-stone-300 mb-4">404</p>
      <a href="/" className="text-stone-500 hover:text-stone-800 transition-colors">
        go home
      </a>
    </div>
  );
}

function App() {
  const path = useRoute();

  if (path === "/" || path === "") {
    return <Home />;
  }

  const gameSlug = path.split("/").filter(Boolean)[0];
  const game = gameSlug ? getGameBySlug(gameSlug) : undefined;

  if (game) {
    const GameComponent = game.component;
    return (
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <p className="text-stone-400">loading...</p>
          </div>
        }
      >
        <GameComponent />
      </Suspense>
    );
  }

  return <NotFound />;
}

export default App;
