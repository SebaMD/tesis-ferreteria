import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function CompactBackLink({ to, state, label }) {
  return <Link className="compact-back-link" to={to} state={state} aria-label={label} title={label}>
    <ArrowLeft size={18} aria-hidden="true" /><span>{label}</span>
  </Link>;
}
