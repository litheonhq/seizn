# @seizn/sdk

Generated TypeScript SDK for the Seizn OpenAPI contract.

```ts
import { SeiznClient } from "@seizn/sdk";

const seizn = new SeiznClient({ apiKey: process.env.SEIZN_API_KEY! });

const memory = await seizn.createMemory({
  content: "Player gave Kaelan a sword",
  agent_id: "kaelan",
  tags: ["unity", "quest"],
});

const results = await seizn.searchMemories({ query: "sword", agent_id: "kaelan" });
const verdict = await seizn.checkCanon({ npc_id: "kaelan", proposed_content: "I reveal the forbidden password." });
```

Regenerate the client from `openapi/seizn-openapi.json`:

```bash
npm run generate
```
