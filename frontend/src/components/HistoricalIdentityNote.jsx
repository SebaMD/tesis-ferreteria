import { identityProvenance, historicalVariantLabel } from "../helpers/historicalIdentity.js";
import { formatDate } from "../helpers/formatters.js";

export default function HistoricalIdentityNote({ capture, children }) {
  const label = identityProvenance(capture);
  if (!label) return children || null;
  const attributes = historicalVariantLabel(capture);
  return <span className="block break-words text-xs font-normal text-slate-500">{attributes&&<span className="block">{attributes}</span>}{children&&<span className="block">{children}</span>}{label}{capture?.capturedAt && <> · Capturada: {formatDate(capture.capturedAt, {dateStyle:"short",timeStyle:"short"})}</>}</span>;
}
