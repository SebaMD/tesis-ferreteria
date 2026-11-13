import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from '../../src/App.jsx';
import Pagination from '../../src/components/Pagination.jsx';
import EmailVerificationPanel from '../../src/components/EmailVerificationPanel.jsx';
import AuthContext from '../../src/context/AuthContext.js';
import ThemeContext from '../../src/context/ThemeContext.js';
import CustomerNoticeContext from '../../src/context/CustomerNoticeContext.js';
import CartProvider from '../../src/context/CartProvider.jsx';
import CheckoutDraftProvider from '../../src/context/CheckoutDraftProvider.jsx';
import FavoritesProvider from '../../src/context/FavoritesProvider.jsx';
import { metricCardClass, metricIconClasses } from '../../src/helpers/uiClasses.js';
import '../../src/styles/styles.css';

const query = new URLSearchParams(location.search);
const role = location.pathname === '/verify-email' ? 'CLIENT' : query.get('role') || 'ADMIN';
const user = { id: 1, role, names: 'Persona de prueba', correo: 'persona@example.test', requiresEmailVerification: location.pathname === '/verify-work-email' };
const isAuthenticated = !['/login', '/register', '/forgot-password', '/reset-password'].includes(location.pathname);
const auth = { user, isAuthenticated, logout() {}, replaceSession() {}, login() { throw new Error('Authentication is not exercised by this visual fixture'); } };
const theme = query.get('theme') || 'light';
document.documentElement.classList.toggle('dark', theme === 'dark');
document.documentElement.style.colorScheme = theme;
if (query.has('registration')) window.history.replaceState({ usr: { fromRegistration: true } }, '', location.href);

export default function Fixture() {
  const [page, setPage] = useState(Number(query.get('page') || 1));
  const [disabled, setDisabled] = useState(false);
  const total = Number(query.get('total') || 0);
  if (location.pathname === '/pagination-test') return <main style={{ margin: 14, border: '1px solid #ccd2d9' }}>
    <Pagination page={page} pageSize={10} totalItems={total * 10} totalPages={total} onPageChange={setPage} disabled={disabled} />
    <output aria-label="Página seleccionada">{page}</output><button onClick={() => setDisabled(value => !value)}>Alternar carga</button>
  </main>;
  if (location.pathname === '/metrics-test') return <main style={{ padding: 14 }}><div className="dashboard-metrics grid grid-cols-4 gap-3.5 max-[980px]:grid-cols-2">
    {Array.from({ length: 4 }, (_, index) => <article className={`${metricCardClass} dashboard-metric-card--long`} key={index} tabIndex={0} role="button"><span className={metricIconClasses.neutral}>#</span><strong>$123.<wbr />456.<wbr />789.<wbr />012</strong><span>Indicador con descripción extensa de prueba</span></article>)}
  </div></main>;
  if (location.pathname === '/panel-test') return <main style={{ padding: 14 }}><EmailVerificationPanel email="persona@example.test" requestCode={() => {}} verifyCode={() => {}} /></main>;
  return <App />;
}

createRoot(document.getElementById('root')).render(<BrowserRouter><AuthContext.Provider value={auth}>
  <ThemeContext.Provider value={{ theme, toggleTheme() {} }}><CartProvider><CheckoutDraftProvider><FavoritesProvider>
    <CustomerNoticeContext.Provider value={{ notices: [], refreshNotices() {} }}><Fixture /><Toaster /></CustomerNoticeContext.Provider>
  </FavoritesProvider></CheckoutDraftProvider></CartProvider></ThemeContext.Provider>
</AuthContext.Provider></BrowserRouter>);
