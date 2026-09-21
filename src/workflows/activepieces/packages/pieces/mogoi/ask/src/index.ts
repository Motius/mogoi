/**
 * `@mogoipieces/piece-mogoi-ask` -- the production "ask the LLM" piece,
 * ported from the legacy `MogoiPiece` interface to upstream's `createPiece`.
 *
 * The action calls back to the daemon's `/v1/mogoi/llm/chat` endpoint via
 * `context.server.token` + `context.server.apiUrl` so the LLM provider stays
 * inside the daemon process (no key plumbing through the engine subprocess).
 */

import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { askAction } from "./lib/actions/ask";

export const mogoiAskPiece = createPiece({
  displayName: "Mogoi: Ask",
  description: "Send a prompt to the daemon's LLM and receive the reply.",
  auth: PieceAuth.None(),
  minimumSupportedRelease: "0.0.0",
  logoUrl: "",
  authors: ["mogoi"],
  actions: [askAction],
  triggers: [],
});
