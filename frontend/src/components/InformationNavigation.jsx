import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { informationNavigationState, informationReturn } from '../helpers/informationNavigation.js';

export function InformationLink(props) {
  const location = useLocation();
  return <Link {...props} state={informationNavigationState(location)} />;
}
export function InformationBackLink() {
  const location = useLocation();
  const back = informationReturn(location.state);
  return <Link className="ml-auto inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-[5px] px-4 py-2 text-center text-sm font-bold text-rust-600 no-underline hover:text-rust-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-500 max-[620px]:w-full" to={back.to} state={back.state}>
    <ArrowLeft size={17} className="shrink-0" aria-hidden="true" />{back.label}
  </Link>;
}
