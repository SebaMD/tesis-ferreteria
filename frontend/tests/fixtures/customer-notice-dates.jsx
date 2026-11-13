import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import Navbar from '../../src/components/Navbar.jsx';
import AuthContext from '../../src/context/AuthContext.js';
import ThemeContext from '../../src/context/ThemeContext.js';
import CustomerNoticeContext from '../../src/context/CustomerNoticeContext.js';
import '../../src/styles/styles.css';

const theme = new URLSearchParams(location.search).get('theme') || 'light';
document.documentElement.classList.toggle('dark', theme === 'dark');
document.documentElement.style.colorScheme = theme;
export default function Fixture() {
  return <BrowserRouter><AuthContext.Provider value={{ user: { id: 1, role: 'ADMIN', names: 'Persona de ensayo' }, logout() {} }}>
    <ThemeContext.Provider value={{ theme, toggleTheme() {} }}>
      <CustomerNoticeContext.Provider value={{ refreshNotices() {} }}><Navbar onToggleSidebar={() => {}} /><Toaster /></CustomerNoticeContext.Provider>
    </ThemeContext.Provider>
  </AuthContext.Provider></BrowserRouter>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
