import { openai } from "@/lib/openai"
import { searchTop5 } from "@/lib/spotify.search"

// JSON-Schema für das Endergebnis (Strict Structured Output)
const resultSchema = {
  name: "dj_resolution",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      spotify_id: { type: "string", description: "Spotify URI oder Track-ID" },
      title: { type: "string" },
      artist: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      rationale: { type: "string" },
    },
    required: ["spotify_id", "title", "artist", "confidence"],
  },
};

export async function resolveWishWithAI(inputText: string) {
  // 1) Erste Runde: Modell + Tool anbieten
  const resp1 = await openai.responses.create({
    model: "gpt-4o-mini", // schnell & günstig; bei Bedarf höher gehen
    input: [
      {
        role: "system",
        content:
          "Du bist ein erfahrener Party-DJ. Aufgabe: Aus freien Wünschen den gemeinten Song identifizieren. " +
          "Nutze das Tool `search_spotify` mit präzisen Queries (Künstler, Titel, Jahr, Stichwörter). " +
          "Berücksichtige Tippfehler, Umgangssprache, Hochzeitskontext. Wenn mehrere Kandidaten möglich, wähle den populärsten Klassiker. " +
          "Am Ende gib NUR das strukturierte Ergebnis laut Schema zurück.",
      },
      {
        role: "user",
        content:
          `Wunsch: """${inputText}"""` +
          "\nBitte identifiziere den exakten Song.",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
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
      },
    ],
    tool_choice: "auto",
    response_format: { type: "json_schema", json_schema: resultSchema }, // Strict JSON Output
  });

  // 2) Tool-Calls auswerten (falls vorhanden)
  const toolCalls = (resp1.output ?? []).filter((c: any) => c.type === "tool_call");
  if (toolCalls.length > 0) {
    const toolOutputs = [];
    for (const call of toolCalls) {
      if (call.tool_name === "search_spotify") {
        const args = JSON.parse(call.arguments ?? "{}");
        const q = String(args.query || "").trim();
        const items = q ? await searchTop5(q) : [];
        toolOutputs.push({
          tool_call_id: call.id,
          output: JSON.stringify({ items }),
        });
      }
    }

    // 3) Tool-Outputs an das Modell zurückgeben, um die finale Auswahl zu treffen
    const resp2 = await openai.responses.submitToolOutputs({
      response_id: resp1.id,
      tool_outputs: toolOutputs,
    });

    // Strict JSON liegt im output_text
    return JSON.parse(resp2.output_text || "{}");
  }

  // Falls das Modell ohne Tool schon sicher war
  return JSON.parse(resp1.output_text || "{}");
}