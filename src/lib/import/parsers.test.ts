import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConvaiExport } from "./convai";
import { parseInworldExport } from "./inworld";
import { parseRivetExport } from "./rivet";

describe("competitor import parsers", () => {
  it("maps the sample Inworld export to 200+ Seizn entities", () => {
    const raw = JSON.parse(readFileSync("fixtures/import/inworld-200-knowledge.json", "utf8"));
    const bundle = parseInworldExport(raw);

    expect(bundle.memories).toHaveLength(205);
    expect(bundle.canonLocks).toHaveLength(5);
    expect(bundle.memories[0]).toMatchObject({
      memoryType: "fact",
      namespace: "import/inworld",
      npcId: "kaelan",
    });
    expect(bundle.canonLocks[0]).toMatchObject({
      scope: "must_know",
      severity: "hard",
    });
  });

  it("maps Convai backstory and tagline", () => {
    const bundle = parseConvaiExport({
      character: {
        id: "vale",
        name: "Archivist Vale",
        tagline: "Memory is a debt.",
        backstory: "Vale guards the archive. Vale remembers every visitor.",
      },
    });

    expect(bundle.memories.length).toBeGreaterThanOrEqual(1);
    expect(bundle.canonLocks).toHaveLength(1);
    expect(bundle.canonLocks[0]).toMatchObject({ scope: "always_say", severity: "soft" });
  });

  it("maps Rivet graph nodes into belief candidates", () => {
    const bundle = parseRivetExport({
      graph: {
        nodes: [
          { id: "node-1", npcId: "mara", text: "Mara believes the ferry captain lied.", confidence: 0.7 },
        ],
      },
    });

    expect(bundle.beliefs).toHaveLength(1);
    expect(bundle.beliefs[0]).toMatchObject({
      holderEntityId: "mara",
      sourceType: "inferred",
      confidence: 0.7,
    });
  });
});
