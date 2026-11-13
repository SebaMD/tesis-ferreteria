import { identityProvenance, historicalVariantLabel } from "../helpers/historicalIdentity.js";
import { formatDate } from "../helpers/formatters.js";

export default function HistoricalIdentityNote({ capture }) {
  const label = identityProvenance(capture);
  if (!label) return null;
  const attributes = historicalVariantLabel(capture);
  return <span className="block break-words text-xs font-normal text-slate-500">{attributes&&<span className="block">{attributes}</span>}{label}{capture?.capturedAt && <> · Capturada: {formatDate(capture.capturedAt, {dateStyle:"short",timeStyle:"short"})}</>}</span>;
}
