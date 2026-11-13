/* eslint-disable react-refresh/only-export-components -- isolated browser fixture */
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import AuthContext from '../../src/context/AuthContext.js';
import CartProvider from '../../src/context/CartProvider.jsx';
import CheckoutDraftProvider from '../../src/context/CheckoutDraftProvider.jsx';
import CustomerNoticeContext from '../../src/context/CustomerNoticeContext.js';
import useCart from '../../src/hooks/useCart.js';
import CheckoutPage from '../../src/pages/CheckoutPage.jsx';
import PaymentResultPage from '../../src/pages/PaymentResultPage.jsx';
import ClientOrdersPage from '../../src/pages/ClientOrdersPage.jsx';
import GuestDeviceOrdersPage from '../../src/pages/GuestDeviceOrdersPage.jsx';
import GuestOrderTrackingPage from '../../src/pages/GuestOrderTrackingPage.jsx';
import '../../src/styles/styles.css';
const params=new URLSearchParams(location.search), guest=params.has('guest')||location.pathname.startsWith('/guest-');
if(params.get('theme')==='dark')document.documentElement.classList.add('dark');
const user=guest?null:{id:1,role:'CLIENT',emailVerified:true,correo:'client@example.test',names:'Client'};
function Tools(){
  const cart=useCart(), navigate=useNavigate();
  return <nav><output data-testid="cart">{cart.items.map(i=>`${i.product.id}:${i.quantity}`).join(',')}</output>
    <button onClick={()=>cart.addItem({id:1,name:'Taladro de prueba',price:1000,currentStock:20,status:true,images:[]},1)}>Agregar taladro nuevo</button>
    <button onClick={()=>cart.addItem({id:2,name:'Martillo nuevo',price:1000,currentStock:20,status:true,images:[]},1)}>Agregar martillo nuevo</button>
    <button onClick={()=>navigate('/checkout')}>Otra compra</button>
    <button onClick={()=>navigate(guest?`/guest-result-a#token=${'a'.repeat(43)}`:'/result?orderId=10')}>Consultar pago A</button>
    <button onClick={()=>navigate(guest?`/guest-result-b#token=${'b'.repeat(43)}`:'/result?orderId=11')}>Consultar pago B</button>
  </nav>;
}
createRoot(document.getElementById('root')).render(<AuthContext.Provider value={{user,isAuthenticated:!!user,mergeGuestCart:false}}>
  <CartProvider><CheckoutDraftProvider><CustomerNoticeContext.Provider value={{deliveryInformation:{mode:'LOCAL_FIXED',flatFee:3000}}}>
    <BrowserRouter><Routes>
      <Route path="/checkout" element={<CheckoutPage/>}/><Route path="/result" element={<PaymentResultPage/>}/>
      <Route path="/guest-result-a" element={<GuestOrderTrackingPage key="a"/>}/><Route path="/guest-result-b" element={<GuestOrderTrackingPage key="b"/>}/>
      <Route path="/orders" element={<ClientOrdersPage/>}/><Route path="/guest-orders" element={<GuestDeviceOrdersPage/>}/>
    </Routes><Tools/></BrowserRouter>
  </CustomerNoticeContext.Provider></CheckoutDraftProvider></CartProvider>
</AuthContext.Provider>);
