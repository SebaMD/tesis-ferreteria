export const normalizeUnit = value => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
export const validUnit = value => typeof value === "string" && ![...value].some(character => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)
  && normalizeUnit(value).length > 0 && normalizeUnit(value).length <= 50;

// Changing a default never propagates to an existing row, including old unset drafts.
export function changeGeneralUnit(draft, unitMeasure) {
  return { ...draft, unitMeasure, rows: draft.rows.map(row => row.unitMeasure === undefined
    ? { ...row, unitMeasure: draft.unitMeasure } : row) };
}

export function unitApplicationPlan(draft, eligibility = null) {
  const target = normalizeUnit(draft.unitMeasure), valid = validUnit(draft.unitMeasure);
  const verified = Array.isArray(eligibility?.variants) && eligibility.familyId === draft.familyId && eligibility.revision === draft.revision && eligibility.target === target;
  const rows = draft.rows.map((row, index) => {
    const before = row.unitMeasure ?? draft.unitMeasure;
    let state = "same", reason = "Ya utiliza la unidad seleccionada; no se modificará.";
    if (before !== target) {
      if (row.isOriginal) { state = "blocked"; reason = "La conversión conserva la unidad del producto original."; }
      else if (row.id && row.hasHistory === true) { state = "blocked"; reason = "Tiene historial de ventas, pedidos o movimientos de inventario. Su unidad está protegida."; }
      else if (row.id) {
        const check = verified && eligibility.variants.find(item => item.productId === row.id);
        if (check && ["eligible", "same"].includes(check.state)) { state = "eligible"; reason = check.state === "same" ? "Se restaurará en el borrador la unidad ya guardada." : check.reason; }
        else { state = "blocked"; reason = check?.reason || (row.hasHistory === false
          ? "Falta consultar la elegibilidad frente a compromisos pendientes."
          : "No se dispone de una verificación completa de historial y compromisos de este SKU."); }
      }
      else { state = "eligible"; reason = "Variante nueva: solo se cambiará su unidad en el borrador."; }
    }
    return { key: row.key, id: row.id ?? null, index: index + 1, name: row.name || "", active: row.status !== false,
      kind: row.id ? "Existente" : "Nueva", before, after: target, state, reason, initialStock: row.id ? null : row.initialStock };
  });
  const fingerprint = JSON.stringify({ target, rows: draft.rows.map(row => ({ key: row.key, id: row.id, unit: row.unitMeasure ?? draft.unitMeasure,
    history: row.hasHistory, original: row.isOriginal, initialStock: row.initialStock, status: row.status })), eligibility: verified ? eligibility : null });
  const changing = rows.filter(row => row.state === "eligible").length;
  const blocked = rows.filter(row => row.state === "blocked").length;
  return { target, valid, rows, changing, blocked, eligibility: verified ? eligibility : null, same: rows.filter(row => row.state === "same").length,
    canApply: valid && changing > 0 && blocked === 0, fingerprint };
}

export function applyUnitApplication(draft, reviewedPlan) {
  const current = unitApplicationPlan(draft, reviewedPlan?.eligibility);
  if (!current.canApply || current.fingerprint !== reviewedPlan?.fingerprint) return { applied: false, draft };
  const keys = new Set(current.rows.filter(row => row.state === "eligible").map(row => row.key));
  return { applied: true, count: keys.size, draft: { ...draft, rows: draft.rows.map(row => keys.has(row.key) ? { ...row, unitMeasure: current.target } : row) } };
}

// A selector choice is tentative until the existing preview is confirmed.
// The original draft fingerprint also protects individual edits made before review.
export function unitSelectionPlan(draft, target, eligibility = null) {
  const candidate = changeGeneralUnit(draft, normalizeUnit(target));
  const plan = unitApplicationPlan(candidate, eligibility);
  return { ...plan, sourceFingerprint: unitApplicationPlan(draft).fingerprint,
    canApply: plan.valid && !plan.blocked && normalizeUnit(draft.unitMeasure) !== plan.target };
}

export function applyUnitSelection(draft, reviewedPlan) {
  const current = unitSelectionPlan(draft, reviewedPlan?.target, reviewedPlan?.eligibility);
  if (!current.canApply || current.sourceFingerprint !== reviewedPlan?.sourceFingerprint || current.fingerprint !== reviewedPlan?.fingerprint) return { applied: false, draft };
  const candidate = changeGeneralUnit(draft, current.target);
  return current.changing ? applyUnitApplication(candidate, current) : { applied: true, count: 0, draft: candidate };
}
