import { openai } from "@/lib/openai"
import { searchTop5 } from "@/lib/spotify.search"

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

// --- Heuristiken für bessere Trefferqualität ---------------------------------
function normalize(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenSet(str: string) {
  const stop = new Set(["der","die","das","und","oder","ein","eine","zu","zum","zur","mit","für","von","im","am","beim","bitte","spiel","spiele","song","lied","track","mach","machmal","kannst","kannstdu","mal","an","auf"]) 
  return new Set(normalize(str).split(" ").filter((t) => t && !stop.has(t)))
}

function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const uni = a.size + b.size - inter
  return uni > 0 ? inter / uni : 0
}

function includesScore(query: string, title: string, artist: string) {
  const q = normalize(query)
  const hay = `${normalize(title)} ${normalize(artist)}`
  if (!q || !hay) return 0
  if (hay.includes(q)) return 1
  // Teiltreffer-Gewichtung
  let score = 0
  const parts = q.split(" ")
  let hit = 0
  for (const p of parts) if (p && hay.includes(p)) hit++
  if (parts.length) score = hit / parts.length
  return score * 0.8
}

type Cand = { id: string; uri: string; title: string; artist: string; popularity?: number; year?: number; album?: string }

function uniqueByUri(items: Cand[]): Cand[] {
  const seen = new Set<string>()
  const out: Cand[] = []
  for (const it of items) {
    const key = it.uri || it.id
    if (!seen.has(key)) {
      seen.add(key)
      out.push(it)
    }
  }
  return out
}

function scoreCandidate(input: string, c: Cand) {
  const qSet = tokenSet(input)
  const tSet = tokenSet(`${c.title} ${c.artist}`)
  const sim = jaccard(qSet, tSet)
  const inc = includesScore(input, c.title, c.artist)
  const pop = (typeof c.popularity === "number" ? c.popularity : 50) / 100
  // Gewichtung: Textähnlichkeit (0.55), Includes/Substring (0.25), Popularität (0.20)
  const score = 0.55 * sim + 0.25 * inc + 0.20 * pop
  return Math.max(0, Math.min(1, score))
}

function rerank(input: string, items: any[]): { best: Cand | null; confidence: number } {
  if (!items?.length) return { best: null, confidence: 0 }
  const mapped: Cand[] = items.map((it: any) => ({
    id: it.uri || it.id,
    uri: it.uri || it.id,
    title: it.title ?? it.name ?? "",
    artist: it.artist ?? (Array.isArray(it.artists) ? it.artists.map((a: any) => a?.name).join(", ") : ""),
    popularity: typeof it.popularity === "number" ? it.popularity : it.popularity,
    year: it.year,
    album: it.album,
  }))
  let best: Cand | null = null
  let bestScore = 0
  for (const c of mapped) {
    const s = scoreCandidate(input, c)
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return { best, confidence: bestScore }
}

function generateQueries(raw: string): string[] {
  const s = raw.trim()
  const n = normalize(s)
  // einfache Heuristiken, um Müllwörter und Klammern zu entfernen
  const cleaned = n
    .replace(/\b(von|mit|feat|featuring)\b/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const quoted = /\s/.test(cleaned) ? `"${cleaned}"` : cleaned
  const variants = [s, cleaned, quoted]
  // Deduplizieren & nur nicht-leere
  return Array.from(new Set(variants.filter(Boolean)))
}

// Wir erzwingen reines JSON über die Anweisung im Prompt (kein Markdown etc.)
const JSON_INSTRUCTION = `\
Gib am Ende AUSSCHLIESSLICH ein JSON-Objekt mit den Feldern:\n{\n  "spotify_id": string,\n  "title": string,\n  "artist": string,\n  "confidence": number (0..1),\n  "rationale": string (optional)\n}\nKeine Erklärungen, kein Markdown, nur rohes JSON.`

export async function resolveWishWithAI(inputText: string) {
  await delay(150) // leicht staffeln

  // 1) Mindestens einen Tool-Call erzwingen
  const resp1 = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "Du bist ein erfahrener Party-DJ. Aufgabe: Aus freien Wünschen den gemeinten Song identifizieren. " +
          "Du MUSST mindestens einmal das Tool `search_spotify` aufrufen. Verwende präzise Queries (Künstler, Titel, Jahr, Stichwörter) und variiere die Suchanfrage, falls nötig. " +
          "Berücksichtige Tippfehler, Umgangssprache, Hochzeitskontext. Wenn mehrere Kandidaten möglich sind, bevorzuge den populärsten Klassiker oder die bekannteste Version. " +
          JSON_INSTRUCTION,
      },
      { role: "user", content: `Wunsch: """${inputText}"""` },
    ],
    tools: [
      {
        type: "function",
        name: "search_spotify",
        description:
          "Suche in Spotify nach einem Song. Rückgabe: Top-5 Kandidaten mit id, title, artist, year, popularity.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Suchstring: artist + title + evtl. year" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: "function", name: "search_spotify" },
    temperature: 0.2,
  })

  const toolCalls = (resp1.output ?? []).filter((c: any) => c.type === "tool_call")
  if (toolCalls.length) {
    const toolOutputs: Array<{ tool_call_id: string; output: string }> = []
    for (const call of toolCalls) {
      if (call.name === "search_spotify") {
        try {
          const args = JSON.parse(call.arguments ?? "{}")
          const q = String(args.query || "").trim()
          // 1. Modell-Query
          let items = q ? await searchTop5(q) : []
          // 2. Eigene Heuristiken, falls schwache Kandidaten
          if (!items?.length) {
            const extra: any[] = []
            for (const v of generateQueries(inputText)) {
              const r = await searchTop5(v)
              extra.push(...r)
            }
            // dedupe
            const dedup = uniqueByUri(extra as any)
            items = dedup
          }
          toolOutputs.push({ tool_call_id: call.id, output: JSON.stringify({ items }) })
        } catch {
          toolOutputs.push({ tool_call_id: call.id, output: JSON.stringify({ items: [] }) })
        }
      }
    }

    const resp2 = await openai.responses.submitToolOutputs({
      response_id: resp1.id,
      tool_outputs: toolOutputs,
    })

    // Versuch 1: Modell-Auswahl akzeptieren
    try {
      const out = JSON.parse(resp2.output_text || "{}")
      if (out && out.spotify_id) return out
    } catch {}

    // Versuch 2: Lokale Re-Rank-Logik auf allen gelieferten Items (aus unserem Tool-Output)
    try {
      const fromTool = toolOutputs
        .map((t) => { try { return JSON.parse(t.output) } catch { return { items: [] } } })
        .flatMap((o) => (Array.isArray(o.items) ? o.items : []))
      const dedup = uniqueByUri(fromTool as any)
      const { best, confidence } = rerank(inputText, dedup as any)
      if (best) {
        return { spotify_id: best.uri || best.id, title: best.title, artist: best.artist, confidence, rationale: "rerank_local" }
      }
    } catch {}

    // Versuch 3: Komplett-Fallback
    const fb = await searchTop5(inputText)
    if (fb.length) {
      const t = fb[0]
      return { spotify_id: t.uri || t.id, title: t.title, artist: t.artist, confidence: 0.6, rationale: "fallback_from_search" }
    }
    return null
  }

  // Kein Tool-Call (sollte nicht passieren, da erzwungen) → Fallback
  const fb = await searchTop5(inputText)
  if (fb.length) {
    const t = fb[0]
    return { spotify_id: t.uri || t.id, title: t.title, artist: t.artist, confidence: 0.55, rationale: "fallback_no_tool_call" }
  }

  return null
}