function getApiBase(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/why-game`;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface GameMessage {
  role: "user" | "assistant";
  content: string;
  argument_category?: string | null;
  argument_strength?: number | null;
  status?: string | null;
  used_previous_knowledge?: boolean | null;
}

export interface CreateGameResponse {
  game_id: string;
  session_token: string;
  objective: string;
  message: GameMessage;
}

export interface SendMessageResponse {
  message: GameMessage;
  game_status: "active" | "won";
}

export interface GameState {
  game: {
    id: string;
    objective: string;
    status: "active" | "won" | "abandoned";
    turn_count: number;
    created_at: string;
  };
  messages: GameMessage[];
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data as T;
}

export async function createGame(objective: string): Promise<CreateGameResponse> {
  const res = await fetch(`${getApiBase()}/game`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ objective }),
  });
  return parseResponse<CreateGameResponse>(res);
}

export async function sendMessage(
  gameId: string,
  sessionToken: string,
  content: string,
): Promise<SendMessageResponse> {
  const res = await fetch(`${getApiBase()}/${gameId}/message`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ content, session_token: sessionToken }),
  });
  return parseResponse<SendMessageResponse>(res);
}

export async function getGame(
  gameId: string,
  sessionToken: string,
): Promise<GameState> {
  const res = await fetch(
    `${getApiBase()}/${gameId}?session_token=${encodeURIComponent(sessionToken)}`,
    { headers: getHeaders() },
  );
  return parseResponse<GameState>(res);
}

export async function restartGame(
  gameId: string,
  sessionToken: string,
): Promise<SendMessageResponse> {
  const res = await fetch(`${getApiBase()}/${gameId}/restart`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ session_token: sessionToken }),
  });
  return parseResponse<SendMessageResponse>(res);
}
