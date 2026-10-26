export function familyDraft(family) {
  return family ? { name: family.name, description: family.description || "", attributes: family.attributes.map((a) => ({ ...a, optionsText: a.options.map((o) => o.label).join("\n") })) }
    : { name: "", description: "", attributes: [{ name: "", options: [], optionsText: "" }] };
}
export function familyBody(draft, family, product) {
  return { name: draft.name, description: draft.description, categoryId: family?.categoryId ?? Number(product.categoryId), brand: family ? family.brand : product.brand?.trim() || null,
    attributes: draft.attributes.map((a) => ({ ...(a.id ? { id: a.id } : {}), name: a.name,
      options: a.optionsText.split("\n").map((v) => v.trim()).filter(Boolean).map((label) => {
        const old = a.options.find((o) => o.label === label);
        return { ...(old ? { id: old.id } : {}), label };
      }) })) };
}
