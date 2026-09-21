/**
 * `@mogoipieces/piece-mogoi-context` -- read-only access to Mogoi state.
 * Vault entities, recent awareness activity, commitments. Use for pulling
 * Mogoi-side data into a flow run as input for downstream nodes.
 *
 * Each action calls back to a dedicated `/v1/mogoi/context/...` endpoint.
 */

import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { vaultSearchAction } from "./lib/actions/vault-search";
import { vaultGetEntityAction } from "./lib/actions/vault-get-entity";
import { awarenessRecentAction } from "./lib/actions/awareness-recent";
import { commitmentsListAction } from "./lib/actions/commitments-list";

export const mogoiContextPiece = createPiece({
  displayName: "Mogoi: Context",
  description:
    "Read from Mogoi state: vault entities, recent awareness activity, commitments. Read-only; use the relevant write tools for mutation.",
  auth: PieceAuth.None(),
  minimumSupportedRelease: "0.0.0",
  logoUrl: "",
  authors: ["mogoi"],
  actions: [
    vaultSearchAction,
    vaultGetEntityAction,
    awarenessRecentAction,
    commitmentsListAction,
  ],
  triggers: [],
});
