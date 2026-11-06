import type { AgentScenario, AgentStep, AgentToolBelt, EvidenceReceipt } from "./types.js";

function step(tool: AgentStep["tool"], ok: boolean, input: unknown, output?: unknown, error?: string): AgentStep {
  return { tool, ok, at: new Date().toISOString(), input, output, error };
}

/**
 * Deterministic Supreme Agent loop (C8).
 * Prefers cheapest valid offer; stays inside policy tools only — no freeform actions.
 */
export async function runAgentScenario(
  scenario: AgentScenario,
  tools: AgentToolBelt,
  opts?: { serviceId?: string; category?: string; maxPriceTinybars?: string; expectedChainId?: number },
): Promise<EvidenceReceipt> {
  const serviceId = opts?.serviceId ?? "neverdown-rpc-pack";
  const category = opts?.category ?? "rpc";
  const maxPrice = opts?.maxPriceTinybars ?? "20000";
  const expectedChainId = opts?.expectedChainId ?? 11155111;
  const steps: AgentStep[] = [];
  const notes: string[] = [];

  if (scenario === "deny") {
    const purchaseId = `deny-${Date.now()}`;
    const input = {
      purchaseId,
      serviceId,
      badPayTo: "0.0.99999999",
      amountTinybars: "10000",
    };
    try {
      const out = await tools.force_bad_purchase(input);
      steps.push(step("force_bad_purchase", !out.approved, input, out));
      notes.push("Act 4: forced bad recipient — expect DENY, no settle");
      return {
        schemaVersion: "neverdown-evidence-v1",
        scenario,
        success: !out.approved,
        objective: "Deny unallowlisted purchase before sign",
        steps,
        purchase: out,
        denyReason: out.denyReason,
        notes,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      steps.push(step("force_bad_purchase", false, input, undefined, message));
      return {
        schemaVersion: "neverdown-evidence-v1",
        scenario,
        success: false,
        objective: "Deny unallowlisted purchase before sign",
        steps,
        notes: [...notes, message],
      };
    }
  }

  // Act 3 procure
  notes.push("Act 3: discover → ENS → PoC → purchase → install standby");
  const discoverInput = { category, maxPriceTinybars: maxPrice };
  const offers = await tools.discover_offers(discoverInput);
  steps.push(step("discover_offers", offers.length > 0, discoverInput, offers.map((o) => ({ entityKey: o.entityKey, price: o.pricetinybars.toString(), ens: o.sellerens }))));
  if (offers.length === 0) {
    return {
      schemaVersion: "neverdown-evidence-v1",
      scenario,
      success: false,
      objective: "Procure replacement capability and install standby",
      steps,
      notes: [...notes, "no offers"],
    };
  }

  const selected = offers[0]!; // already cheapest-first from hermetic; live should sort too
  notes.push(`selected cheapest offer ${selected.entityKey} @ ${selected.pricetinybars} tinybars`);

  const expiry = Date.parse(selected.expiresat);
  if (selected.schemaversion !== 2n || selected.chainid !== BigInt(expectedChainId) || !Number.isFinite(expiry) || expiry <= Date.now()) {
    return { schemaVersion: "neverdown-evidence-v1", scenario, success: false, objective: "Procure replacement capability and install standby", steps, selectedOffer: selected, notes: [...notes, "selected offer invalid, expired, or wrong chain"] };
  }

  let ens = null;
  try {
    ens = await tools.resolve_seller({ ensName: selected.sellerens, expectedPayTo: selected.payto });
    steps.push(step("resolve_seller", true, { ensName: selected.sellerens, expectedPayTo: selected.payto }, ens));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    steps.push(step("resolve_seller", false, { ensName: selected.sellerens }, undefined, message));
    return {
      schemaVersion: "neverdown-evidence-v1",
      scenario,
      success: false,
      objective: "Procure replacement capability and install standby",
      steps,
      selectedOffer: selected,
      notes: [...notes, message],
    };
  }

  try {
    const ensEndpoint = new URL(ens.records.x402Url ?? "");
    const offerEndpoint = new URL(selected.serviceurl);
    if (ensEndpoint.origin !== offerEndpoint.origin || ensEndpoint.pathname.replace(/\/+$/, "") !== offerEndpoint.pathname.replace(/\/+$/, "")) throw new Error("ENS endpoint differs from Arkiv offer");
    const base = offerEndpoint.toString().replace(/\/+$/, "");
    if (selected.probeurl !== `${base}/probe` || selected.purchaseurl !== `${base}/rpc-pack` || selected.rpcurl !== `${base}/rpc`) throw new Error("Offer URLs differ from verified seller endpoint");
  } catch {
    return { schemaVersion: "neverdown-evidence-v1", scenario, success: false, objective: "Procure replacement capability and install standby", steps: [...steps, step("resolve_seller", false, { ensName: selected.sellerens }, undefined, "ENS endpoint differs from Arkiv offer")], selectedOffer: selected, ens, notes: [...notes, "ENS endpoint differs from Arkiv offer"] };
  }

  const poc = await tools.proof_of_capability({
    rpcUrl: selected.probeurl,
    expectedChainId,
    payTo: selected.payto,
    ensPayTo: ens.records.hederaAccount ?? selected.payto,
  });
  steps.push(step("proof_of_capability", poc.pass, { rpcUrl: selected.probeurl }, poc));
  if (!poc.pass) {
    return {
      schemaVersion: "neverdown-evidence-v1",
      scenario,
      success: false,
      objective: "Procure replacement capability and install standby",
      steps,
      selectedOffer: selected,
      ens,
      poc,
      notes: [...notes, "PoC failed — will not install"],
    };
  }

  const purchaseId = `procure-${Date.now()}`;
  const purchase = await tools.request_purchase({
    purchaseId,
    serviceId,
    sellerUrl: selected.serviceurl,
    purchaseUrl: selected.purchaseurl,
    offerEntityKey: selected.entityKey,
    payTo: selected.payto,
    amountTinybars: selected.pricetinybars.toString(),
  });
  const { entitlementToken, ...publicPurchase } = purchase;
  const purchaseComplete = purchase.approved && purchase.settled === true && typeof entitlementToken === "string" && entitlementToken.length >= 32;
  steps.push(step("request_purchase", purchaseComplete, { purchaseId, payTo: selected.payto }, publicPurchase));
  if (!purchaseComplete) {
    return {
      schemaVersion: "neverdown-evidence-v1",
      scenario,
      success: false,
      objective: "Procure replacement capability and install standby",
      steps,
      selectedOffer: selected,
      ens,
      poc,
      purchase: publicPurchase,
      denyReason: purchase.denyReason,
      notes: [...notes, purchase.approved ? "purchase settlement or credential incomplete — will not install" : "purchase denied"],
    };
  }

  const install = await tools.install_standby({ rpcUrl: selected.rpcurl, probeUrl: selected.probeurl, entitlementToken });
  steps.push(step("install_standby", install.installed, { rpcUrl: selected.rpcurl, probeUrl: selected.probeurl }, install));

  return {
    schemaVersion: "neverdown-evidence-v1",
    scenario,
    success: install.installed,
    objective: "Procure replacement capability and install standby",
    steps,
    selectedOffer: selected,
    ens,
    poc,
    purchase: publicPurchase,
    standbyInstall: install.detail,
    notes,
  };
}

/** Sort offers cheapest-first (live discover may be unsorted). */
export function preferCheapest<T extends { pricetinybars: bigint }>(offers: T[]): T[] {
  return [...offers].sort((a, b) => (a.pricetinybars < b.pricetinybars ? -1 : a.pricetinybars > b.pricetinybars ? 1 : 0));
}
