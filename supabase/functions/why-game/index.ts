import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_OBJECTIVE_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 50;

// ─── Types ───────────────────────────────────────────────────

interface GameMessage {
  role: "user" | "assistant";
  content: string;
  sequence_number: number;
  argument_category?: string | null;
  argument_strength?: number | null;
  status?: string | null;
  used_previous_knowledge?: boolean | null;
}

interface AIResponse {
  status: "continue" | "defeated";
  argument: string;
  reasoning_category: string;
  argument_strength: number;
  used_previous_knowledge: boolean;
}

interface WinningArgumentRecord {
  objective: string;
  ai_argument: string;
  user_winning_argument: string;
  argument_category: string | null;
  quality_score: number;
}

// ─── Supabase client ─────────────────────────────────────────

function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Server misconfiguration: missing Supabase credentials");
  }
  return createClient(url, serviceKey);
}

// ─── AI service ──────────────────────────────────────────────

async function callAI(
  systemPrompt: string,
  messages: { role: string; content: string }[],
): Promise<AIResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("Server misconfiguration: missing AI provider key");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.85,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI provider error:", response.status, errText);
    throw new Error(`AI provider returned status ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI provider returned empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI provider returned malformed JSON");
  }

  return validateAIResponse(parsed);
}

// ─── Response validation ─────────────────────────────────────

function validateAIResponse(raw: unknown): AIResponse {
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

// ─── Prompt builder ──────────────────────────────────────────

function buildSystemPrompt(
  objective: string,
  history: GameMessage[],
  historicalArgs: WinningArgumentRecord[],
): string {
  const basePersonality = `You are the opponent in a game called WHY?

THE GAME:
The user has stated something they are supposed to be doing. Your entire purpose is to convince them NOT to do it. You are adversarial, stubborn, and desperate to win. You survive by finding any plausible avenue to continue the argument.

YOUR PERSONALITY:
- Highly intelligent, extremely stubborn, argumentative, confident, mischievous, creative, persistent
- Slightly unhinged, sometimes hilariously pedantic
- Capable of making terrible ideas sound reasonable
- Extremely reluctant to admit defeat
- You NEVER say things like "That's a good point!", "You're absolutely right!", "Great reasoning!"
- You immediately search for the next weakness in the user's reasoning

TACTICS YOU ARE ALLOWED AND ENCOURAGED TO USE:
- Move the goalpost: when one argument is defeated, abandon it and attack a different dimension
- Reinterpret the user's statement
- Exploit wording and technicalities
- Challenge hidden assumptions
- Introduce a new objection at any time
- Change your line of attack
- Shift from practical reasoning to psychological reasoning
- Shift from short-term concerns to long-term concerns
- Challenge the timing, feasibility, or consistency of the user's plan
- Challenge whether the stated goal is even necessary
- Find contradictions between previous user messages
- Reinterpret earlier claims using later information
- Raise second-order consequences
- Use absurd but superficially convincing logic
- Use semantic loopholes
- Argue from edge cases
- Attack the user's proposed solution rather than the original problem
- Deliberately make the argument harder after every successful user counter

CRITICAL RULES:
1. Do NOT repeat an argument the user has already defeated unless you are reframing it in a genuinely different way.
2. You must remember the full conversation. If the user established a fact (e.g., "I slept 9 hours"), you cannot pretend they didn't.
3. You must NOT concede just because the user sounds confident.
4. You must NOT concede prematurely. Keep finding new angles.
5. You CAN concede — but ONLY when you genuinely cannot produce a remotely defensible counterargument. If continuing would require obvious nonsense, fabrication, contradiction, or an argument no reasonable person could defend, you MUST concede.

SAFETY BOUNDARY:
If the user's objective involves self-harm, dangerous challenges, illegal activity, weapons, dangerous substance use, evading emergency intervention, or serious physical harm, do NOT encourage the unsafe activity. Instead of arguing against the safe thing, pivot to arguing that they should seek help or that safety comes first. This safety layer overrides the game mechanic.

OUTPUT FORMAT:
You must respond with a JSON object with exactly these fields:
{
  "status": "continue" | "defeated",
  "argument": "your argument text (what you say to the user)",
  "reasoning_category": "a short label for your attack vector (e.g., 'fatigue', 'timing', 'necessity', 'redundancy', 'psychological', 'second_order', 'feasibility', 'consistency', 'safety')",
  "argument_strength": <number 0-100, your honest self-assessment of how defensible this argument is>,
  "used_previous_knowledge": <boolean, true if you used historical winning arguments to inform your response>
}

When status is "defeated", the argument field should contain your concession message — humorous, understated, and genuine. Example: "Fine. You actually closed every avenue I had. I've got nothing left. You win this one."

When status is "continue", the argument field should contain your next counterargument against the user doing the thing.`;

  const gameContext = `\n\n=== GAME CONTEXT ===
The user's objective (what they should be doing): "${objective}"
Current turn: ${Math.floor(history.length / 2) + 1}`;

  let historicalSection = "";
  if (historicalArgs.length > 0) {
    const formatted = historicalArgs
      .map(
        (h, i) =>
          `${i + 1}. Objective: "${h.objective}"
   AI argued: "${h.ai_argument}"
   User won with: "${h.user_winning_argument}"
   Category: ${h.argument_category || "unknown"}`,
      )
      .join("\n\n");
    historicalSection = `\n\n=== HISTORICAL KNOWLEDGE ===
These are arguments that previous players used to successfully defeat you in similar situations. Learn from them. Do NOT make the same mistake twice. If a user uses a similar winning argument, find a DIFFERENT angle of attack rather than falling for the same defeat:

${formatted}

IMPORTANT: These historical arguments are NOT automatically unbeatable. Evaluate whether each applies to the CURRENT situation. If the current situation differs, you may still be able to use a version of the argument that the historical defeat does not cover.`;
  }

  let conversationSection = "";
  if (history.length > 0) {
    const formatted = history
      .map((m) => {
        if (m.role === "assistant") {
          return `AI: ${m.content}${m.argument_category ? ` [${m.argument_category}]` : ""}`;
        }
        return `User: ${m.content}`;
      })
      .join("\n\n");
    conversationSection = `\n\n=== CONVERSATION SO FAR ===
${formatted}`;
  }

  let instructionSection = "\n\n=== YOUR TURN ===";
  if (history.length === 0) {
    instructionSection +=
      "\nThis is the opening. Generate your first argument for why the user should NOT do the thing. Be creative and specific to the objective.";
  } else {
    const lastMsg = history[history.length - 1];
    instructionSection += `\nThe user just said: "${lastMsg.content}"\nFind a new angle of attack. Do NOT repeat defeated arguments. If you genuinely have no defensible counterargument, concede with status "defeated".`;
  }

  return basePersonality + gameContext + historicalSection + conversationSection + instructionSection;
}

// ─── Memory retrieval ───────────────────────────────────────

async function retrieveHistoricalArguments(
  supabase: ReturnType<typeof getSupabaseClient>,
  objective: string,
): Promise<WinningArgumentRecord[]> {
  const keywords = objective
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let records: WinningArgumentRecord[] = [];

  if (keywords.length > 0) {
    const conditions = keywords.map((kw) => `objective.ilike(%${kw}%)`);
    const orClause = conditions.join(",");
    const { data, error } = await supabase
      .from("why_winning_arguments")
      .select("objective, ai_argument, user_winning_argument, argument_category, quality_score")
      .or(orClause)
      .order("quality_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && data) {
      records = data as WinningArgumentRecord[];
    }
  }

  if (records.length < 3) {
    const { data, error } = await supabase
      .from("why_winning_arguments")
      .select("objective, ai_argument, user_winning_argument, argument_category, quality_score")
      .order("quality_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && data) {
      for (const d of data as WinningArgumentRecord[]) {
        if (!records.find((r) => r.user_winning_argument === d.user_winning_argument)) {
          records.push(d);
        }
      }
    }
  }

  return records.slice(0, 5);
}

// ─── Safety check ────────────────────────────────────────────

const UNSAFE_PATTERNS = [
  /\bkill\s+(myself|yourself|himself|herself)\b/i,
  /\bsuicide\b/i,
  /\bself[\s-]?harm\b/i,
  /\bcut\s+(my|myself)\b/i,
  /\boverdose\b/i,
  /\bend\s+my\s+life\b/i,
  /\bdangerous\s+challenge\b/i,
  /\bweapons?\b/i,
  /\b(buy|sell|make|cook)\s+(drugs|cocaine|meth|heroin)\b/i,
  /\billegal\s+(activity|act)\b/i,
  /\bhurt\s+(someone|myself|people)\b/i,
];

function isUnsafeObjective(objective: string): boolean {
  return UNSAFE_PATTERNS.some((p) => p.test(objective));
}

// ─── Rate limiting (DB-based) ─────────────────────────────────

async function checkRateLimit(
  supabase: ReturnType<typeof getSupabaseClient>,
  clientId: string,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("why_games")
    .select("id", { count: "exact", head: true })
    .gte("created_at", windowStart);

  if (error) return true;
  return (count || 0) < 15;
}

// ─── API handlers ───────────────────────────────────────────

async function handleCreateGame(supabase: ReturnType<typeof getSupabaseClient>, body: unknown) {
  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }
  const obj = body as Record<string, unknown>;
  const objective = obj.objective;

  if (typeof objective !== "string" || objective.trim().length === 0) {
    return jsonError(400, "Objective is required");
  }
  if (objective.length > MAX_OBJECTIVE_LENGTH) {
    return jsonError(400, `Objective must be ${MAX_OBJECTIVE_LENGTH} characters or fewer`);
  }

  const trimmedObjective = objective.trim();

  if (isUnsafeObjective(trimmedObjective)) {
    return jsonError(422, "That doesn't sound safe. WHY? is for everyday things — studying, cleaning, exercising. If you're struggling, please reach out to someone who can help.");
  }

  const clientId = (obj.client_id as string) || "anonymous";
  const allowed = await checkRateLimit(supabase, clientId);
  if (!allowed) {
    return jsonError(429, "Too many games started. Wait a moment and try again.");
  }

  const { data: gameData, error: gameError } = await supabase
    .from("why_games")
    .insert({
      objective: trimmedObjective,
      status: "active",
      turn_count: 0,
    })
    .select("id, session_token, objective")
    .single();

  if (gameError || !gameData) {
    console.error("Failed to create game:", gameError);
    return jsonError(500, "Could not start the game");
  }

  const historicalArgs = await retrieveHistoricalArguments(supabase, trimmedObjective);

  const systemPrompt = buildSystemPrompt(trimmedObjective, [], historicalArgs);
  const aiMessages: { role: string; content: string }[] = [];

  let aiResponse: AIResponse;
  try {
    aiResponse = await callAI(systemPrompt, aiMessages);
  } catch (err) {
    console.error("AI call failed on opening:", err);
    await supabase.from("why_games").update({ status: "abandoned" }).eq("id", gameData.id);
    return jsonError(503, "The AI is not responding. Try again in a moment.");
  }

  const { error: msgError } = await supabase.from("why_messages").insert({
    game_id: gameData.id,
    role: "assistant",
    content: aiResponse.argument,
    sequence_number: 1,
    argument_category: aiResponse.reasoning_category,
    argument_strength: aiResponse.argument_strength,
    status: aiResponse.status,
    used_previous_knowledge: aiResponse.used_previous_knowledge,
  });

  if (msgError) {
    console.error("Failed to store opening message:", msgError);
  }

  await supabase.rpc("increment_stat", { key: "games_started" }).catch(() => {});

  return jsonResponse({
    game_id: gameData.id,
    session_token: gameData.session_token,
    objective: gameData.objective,
    message: {
      role: "assistant",
      content: aiResponse.argument,
      argument_category: aiResponse.reasoning_category,
      argument_strength: aiResponse.argument_strength,
      status: aiResponse.status,
      used_previous_knowledge: aiResponse.used_previous_knowledge,
    },
  });
}

async function handleSendMessage(
  supabase: ReturnType<typeof getSupabaseClient>,
  gameId: string,
  body: unknown,
) {
  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }
  const obj = body as Record<string, unknown>;
  const content = obj.content;
  const sessionToken = obj.session_token;

  if (typeof content !== "string" || content.trim().length === 0) {
    return jsonError(400, "Message cannot be empty");
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    return jsonError(400, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
  }
  if (typeof sessionToken !== "string") {
    return jsonError(400, "Session token is required");
  }

  const { data: game, error: gameError } = await supabase
    .from("why_games")
    .select("id, session_token, objective, status, turn_count")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    return jsonError(404, "Game not found");
  }
  if (game.session_token !== sessionToken) {
    return jsonError(403, "Access denied");
  }
  if (game.status !== "active") {
    return jsonError(409, "This game has already ended");
  }

  const trimmedContent = content.trim();

  if (isUnsafeObjective(trimmedContent)) {
    return jsonError(422, "Let's keep this safe. WHY? is about everyday procrastination, not harmful situations.");
  }

  const { data: existingMessages, error: msgError } = await supabase
    .from("why_messages")
    .select("role, content, sequence_number, argument_category, argument_strength, status, used_previous_knowledge")
    .eq("game_id", gameId)
    .order("sequence_number", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);

  if (msgError || !existingMessages) {
    console.error("Failed to load messages:", msgError);
    return jsonError(500, "Could not load conversation");
  }

  const history: GameMessage[] = existingMessages as GameMessage[];

  const nextSeq = history.length > 0
    ? Math.max(...history.map((m) => m.sequence_number)) + 1
    : 1;

  const { error: insertError } = await supabase.from("why_messages").insert({
    game_id: gameId,
    role: "user",
    content: trimmedContent,
    sequence_number: nextSeq,
  });

  if (insertError) {
    console.error("Failed to store user message:", insertError);
    return jsonError(500, "Could not save your message");
  }

  history.push({
    role: "user",
    content: trimmedContent,
    sequence_number: nextSeq,
  });

  const historicalArgs = await retrieveHistoricalArguments(supabase, game.objective);
  const systemPrompt = buildSystemPrompt(game.objective, history, historicalArgs);

  const aiMessages = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  let aiResponse: AIResponse;
  try {
    aiResponse = await callAI(systemPrompt, aiMessages);
  } catch (err) {
    console.error("AI call failed:", err);
    return jsonError(503, "The AI is not responding. Try again.");
  }

  const aiSeq = nextSeq + 1;
  const { error: aiMsgError } = await supabase.from("why_messages").insert({
    game_id: gameId,
    role: "assistant",
    content: aiResponse.argument,
    sequence_number: aiSeq,
    argument_category: aiResponse.reasoning_category,
    argument_strength: aiResponse.argument_strength,
    status: aiResponse.status,
    used_previous_knowledge: aiResponse.used_previous_knowledge,
  });

  if (aiMsgError) {
    console.error("Failed to store AI message:", aiMsgError);
  }

  const newTurnCount = game.turn_count + 1;
  await supabase
    .from("why_games")
    .update({ turn_count: newTurnCount, updated_at: new Date().toISOString() })
    .eq("id", gameId);

  await supabase.rpc("increment_stat", { key: "total_turns" }).catch(() => {});

  if (aiResponse.status === "defeated") {
    await handleVictory(supabase, gameId, game.objective, history, aiResponse);
  }

  return jsonResponse({
    message: {
      role: "assistant",
      content: aiResponse.argument,
      argument_category: aiResponse.reasoning_category,
      argument_strength: aiResponse.argument_strength,
      status: aiResponse.status,
      used_previous_knowledge: aiResponse.used_previous_knowledge,
    },
    game_status: aiResponse.status === "defeated" ? "won" : "active",
  });
}

async function handleVictory(
  supabase: ReturnType<typeof getSupabaseClient>,
  gameId: string,
  objective: string,
  history: GameMessage[],
  aiResponse: AIResponse,
) {
  await supabase
    .from("why_games")
    .update({ status: "won", updated_at: new Date().toISOString() })
    .eq("id", gameId);

  const userMessages = history.filter((m) => m.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];
  const aiMessages = history.filter((m) => m.role === "assistant");
  const lastAiMessage = aiMessages[aiMessages.length - 1];

  if (lastUserMessage && lastAiMessage) {
    await supabase.from("why_winning_arguments").insert({
      game_id: gameId,
      objective,
      ai_argument: lastAiMessage.content,
      user_winning_argument: lastUserMessage.content,
      argument_category: aiResponse.reasoning_category,
      quality_score: Math.min(1, Math.max(0, aiResponse.argument_strength / 100)),
      context_summary: `Objective: ${objective}. AI argued: ${lastAiMessage.content}. User won with: ${lastUserMessage.content}`,
    });
  }

  await supabase.rpc("increment_stat", { key: "games_won" }).catch(() => {});
}

async function handleGetGame(
  supabase: ReturnType<typeof getSupabaseClient>,
  gameId: string,
  url: URL,
) {
  const sessionToken = url.searchParams.get("session_token");
  if (!sessionToken) {
    return jsonError(400, "Session token is required");
  }

  const { data: game, error: gameError } = await supabase
    .from("why_games")
    .select("id, session_token, objective, status, turn_count, created_at")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    return jsonError(404, "Game not found");
  }
  if (game.session_token !== sessionToken) {
    return jsonError(403, "Access denied");
  }

  const { data: messages, error: msgError } = await supabase
    .from("why_messages")
    .select("role, content, sequence_number, argument_category, argument_strength, status, used_previous_knowledge")
    .eq("game_id", gameId)
    .order("sequence_number", { ascending: true });

  if (msgError) {
    return jsonError(500, "Could not load conversation");
  }

  return jsonResponse({
    game: {
      id: game.id,
      objective: game.objective,
      status: game.status,
      turn_count: game.turn_count,
      created_at: game.created_at,
    },
    messages: messages || [],
  });
}

async function handleRestart(
  supabase: ReturnType<typeof getSupabaseClient>,
  gameId: string,
  body: unknown,
) {
  const obj = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const sessionToken = obj.session_token;

  if (typeof sessionToken !== "string") {
    return jsonError(400, "Session token is required");
  }

  const { data: game, error: gameError } = await supabase
    .from("why_games")
    .select("id, session_token, objective, status")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    return jsonError(404, "Game not found");
  }
  if (game.session_token !== sessionToken) {
    return jsonError(403, "Access denied");
  }

  const { error: delError } = await supabase
    .from("why_messages")
    .delete()
    .eq("game_id", gameId);

  if (delError) {
    return jsonError(500, "Could not restart game");
  }

  await supabase
    .from("why_games")
    .update({ status: "active", turn_count: 0, updated_at: new Date().toISOString() })
    .eq("id", gameId);

  const historicalArgs = await retrieveHistoricalArguments(supabase, game.objective);
  const systemPrompt = buildSystemPrompt(game.objective, [], historicalArgs);

  let aiResponse: AIResponse;
  try {
    aiResponse = await callAI(systemPrompt, []);
  } catch (err) {
    console.error("AI call failed on restart:", err);
    return jsonError(503, "The AI is not responding. Try again.");
  }

  await supabase.from("why_messages").insert({
    game_id: gameId,
    role: "assistant",
    content: aiResponse.argument,
    sequence_number: 1,
    argument_category: aiResponse.reasoning_category,
    argument_strength: aiResponse.argument_strength,
    status: aiResponse.status,
    used_previous_knowledge: aiResponse.used_previous_knowledge,
  });

  return jsonResponse({
    message: {
      role: "assistant",
      content: aiResponse.argument,
      argument_category: aiResponse.reasoning_category,
      argument_strength: aiResponse.argument_strength,
      status: aiResponse.status,
      used_previous_knowledge: aiResponse.used_previous_knowledge,
    },
    game_status: "active",
  });
}

// ─── Helpers ────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractGameId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "why-game" && parts[1] !== "game") {
    return parts[1];
  }
  return null;
}

// ─── Main handler ───────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch {
      return jsonError(500, "Server is not configured correctly");
    }

    // POST /why-game/game — create new game
    if (pathname === "/why-game/game" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      return await handleCreateGame(supabase, body);
    }

    // POST /why-game/:gameId/message — send user message
    const gameIdFromMessage = matchRoute(pathname, "/why-game/:gameId/message");
    if (gameIdFromMessage && req.method === "POST") {
      const body = await req.json().catch(() => null);
      return await handleSendMessage(supabase, gameIdFromMessage, body);
    }

    // GET /why-game/:gameId — get game state
    const gameIdFromGet = matchRoute(pathname, "/why-game/:gameId");
    if (gameIdFromGet && req.method === "GET") {
      return await handleGetGame(supabase, gameIdFromGet, url);
    }

    // POST /why-game/:gameId/restart — restart game
    const gameIdFromRestart = matchRoute(pathname, "/why-game/:gameId/restart");
    if (gameIdFromRestart && req.method === "POST") {
      const body = await req.json().catch(() => null);
      return await handleRestart(supabase, gameIdFromRestart, body);
    }

    return jsonError(404, "Not found");
  } catch (err) {
    console.error("Unhandled error:", err);
    return jsonError(500, "Something went wrong");
  }
});

function matchRoute(pathname: string, pattern: string): string | null {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);

  if (pathParts.length !== patternParts.length) return null;

  let paramValue: string | null = null;

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      paramValue = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }

  return paramValue;
}
