import { identityProvenance } from "../helpers/historicalIdentity.js";
import { formatDate } from "../helpers/formatters.js";

export default function HistoricalIdentityNote({ capture }) {
  const label = identityProvenance(capture);
  if (!label) return null;
  return <span className="block break-words text-xs font-normal text-slate-500">{label}{capture?.capturedAt && <> · Capturada: {formatDate(capture.capturedAt, {dateStyle:"short",timeStyle:"short"})}</>}</span>;
}
