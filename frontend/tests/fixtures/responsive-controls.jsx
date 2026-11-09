import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppSelect from '../../src/components/AppSelect.jsx';
import AppModal from '../../src/components/AppModal.jsx';
import OrderSummaryCard from '../../src/components/orders/OrderSummaryCard.jsx';
import ProductsPage from '../../src/pages/ProductsPage.jsx';
import StatisticsPage from '../../src/pages/StatisticsPage.jsx';
import ReportsPage from '../../src/pages/ReportsPage.jsx';
import DashboardPage from '../../src/pages/DashboardPage.jsx';
import SalesPage from '../../src/pages/SalesPage.jsx';
import InternalEmailVerificationPage from '../../src/pages/InternalEmailVerificationPage.jsx';
import AuthContext from '../../src/context/AuthContext.js';
import { BrowserRouter, Link } from 'react-router-dom';
import { Toaster } from 'sonner';
import '../../src/styles/styles.css';
export default function Fixture() {
  const [value,setValue]=useState(''); const [open,setOpen]=useState(false);
  const mode=new URLSearchParams(location.search).get('mode');
  if(mode==='inventory')return <BrowserRouter><AuthContext.Provider value={{user:{id:1,role:'ADMIN'}}}><nav data-loading-navbar style={{position:'sticky',top:0,height:60,zIndex:20,background:'white'}}><Link to="?mode=inventory&view=history">Movimientos recientes</Link></nav><div style={{height:900}}/><ProductsPage/><div style={{height:900}}/><Toaster/></AuthContext.Provider></BrowserRouter>;
  if(mode==='statistics')return <><StatisticsPage/><Toaster/></>;
  if(mode==='reports')return <><ReportsPage/><Toaster/></>;
  if(['dashboard','sales','work-email'].includes(mode))return <BrowserRouter><AuthContext.Provider value={{isAuthenticated:true,user:{id:1,role:mode==='work-email'?'WAREHOUSE':new URLSearchParams(location.search).get('role')||'ADMIN',names:'Persona de prueba',correo:'worker@example.test',requiresEmailVerification:true},logout(){window.fixtureLogoutCalls=(window.fixtureLogoutCalls||0)+1;}}}>{mode==='dashboard'?<DashboardPage/>:mode==='sales'?<SalesPage/>:<InternalEmailVerificationPage/>}<Toaster/></AuthContext.Provider></BrowserRouter>;
  return <main style={{padding:16}}><AppSelect ariaLabel="Categoría" value={value} onChange={setValue} options={[{value:'',label:'Todas'},...Array.from({length:12},(_,i)=>({value:String(i),label:`Categoría ${i}`}))]}/><output>{value}</output>
    <header className="buyer-orders-heading flex flex-wrap items-end justify-between gap-3"><div><h2>Pedidos en curso</h2><p>Compras en preparación o entrega.</p></div><div><span data-count>1</span></div></header>
    <OrderSummaryCard order={{id:1,status:'OUT_FOR_DELIVERY',deliveryType:'DELIVERY',createdAt:'2026-01-01',total:1000,items:[{productName:'Artículo de prueba',quantity:1,unitMeasure:'unidad'}]}} onView={()=>{}}/>
    <div id="client-address-section"><div className="flex flex-wrap gap-2"><button>Confirmar eliminación</button><button>Cancelar dirección</button></div></div>
    <div className="sale-return-product"><div>Artículo simulado</div><div className="sale-return-values"><span className="return-quantity">1 unidad</span><span>·</span><strong>$1.000</strong></div></div>
    <button onClick={()=>setOpen(true)}>Desactivar</button><AppModal fitVisualViewport open={open} title="Desactivar cuenta" onClose={()=>setOpen(false)}><p>Primero lee las advertencias.</p><input aria-label="Contraseña actual" type="password"/><div className="account-mobile-actions flex justify-end gap-2"><button onClick={()=>setOpen(false)}>Cancelar</button><button>Confirmar</button></div></AppModal>
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Fixture/></StrictMode>);
