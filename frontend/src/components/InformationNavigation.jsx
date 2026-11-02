import CompactBackLink from './CompactBackLink.jsx';
import { Link, useLocation } from 'react-router-dom';
import { informationNavigationState, informationReturn } from '../helpers/informationNavigation.js';

export function InformationLink(props) {
  const location = useLocation();
  return <Link {...props} state={informationNavigationState(location)} />;
}
export function InformationBackLink() {
  const location = useLocation();
  const back = informationReturn(location.state);
  return <CompactBackLink {...back} />;
}
