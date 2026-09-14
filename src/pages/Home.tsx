import { games } from "@/games/registry";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
      <header className="text-center mb-20">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-stone-900">
          experiments
        </h1>
        <p className="mt-4 text-stone-500 text-lg">
          small, strange, playable things
        </p>
      </header>

      <nav className="w-full max-w-2xl">
        <ul className="space-y-2">
          {games.map((game) => (
            <li key={game.slug}>
              <a
                href={game.path}
                className="group flex items-baseline justify-between border border-stone-200 rounded-lg px-6 py-5 hover:border-stone-400 transition-colors duration-200 bg-white"
              >
                <div>
                  <span className="text-2xl font-bold text-stone-900 group-hover:text-stone-700">
                    {game.title}
                  </span>
                  <p className="text-stone-500 text-sm mt-1">
                    {game.description}
                  </p>
                </div>
                <span className="text-stone-300 group-hover:text-stone-500 group-hover:translate-x-1 transition-all duration-200 text-xl">
                  &rarr;
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="mt-20 text-stone-400 text-xs">
        more games eventually
      </footer>
    </div>
  );
}
