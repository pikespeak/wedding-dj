export type Candidate = {
  spotifyId: string
  title: string
  artist: string
  base?: number
}

export type ScoreContext = {
  phase?: "warmup" | "dinner" | "dance" | "peak" | "cooldown"
}

export function scoreCandidate(candidate: Candidate, _ctx: ScoreContext = {}) {
  // MVP-Platzhalter: gebe festen Score zurück
  return candidate.base ?? 0
}
