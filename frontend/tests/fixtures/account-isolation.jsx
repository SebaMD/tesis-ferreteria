/* eslint-disable react-refresh/only-export-components -- isolated browser entry */
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,useNavigate} from 'react-router-dom';
import {useState} from 'react';
import {Toaster} from 'sonner';
import AuthProvider from '../../src/context/AuthProvider.jsx';
import CartProvider from '../../src/context/CartProvider.jsx';
import CheckoutDraftProvider from '../../src/context/CheckoutDraftProvider.jsx';
import CustomerNoticeContext from '../../src/context/CustomerNoticeContext.js';
import useAuth from '../../src/hooks/useAuth.js';
import useCart from '../../src/hooks/useCart.js';
import api from '../../src/api/httpClient.js';
import CheckoutPage from '../../src/pages/CheckoutPage.jsx';
import ClientOrdersPage from '../../src/pages/ClientOrdersPage.jsx';
import PaymentResultPage from '../../src/pages/PaymentResultPage.jsx';
import '../../src/styles/styles.css';
function Controls(){
  const auth=useAuth(),cart=useCart(),navigate=useNavigate();const [message,setMessage]=useState('');
  const run=fn=>fn().catch(e=>setMessage(e.code||'ERROR'));
  return <nav><output data-testid="identity">{auth.user?.id||'guest'}</output><output data-testid="cart">{cart.items.map(i=>`${i.product.id}:${i.quantity}`).join(',')}</output><output data-testid="message">{message}</output>
    <button onClick={()=>run(()=>auth.login({email:'A',password:'synthetic'}))}>Login A</button><button onClick={()=>run(()=>auth.login({email:'B',password:'synthetic'}))}>Login B</button><button onClick={()=>run(auth.logout)}>Logout</button>
    <button onClick={()=>cart.addItem({id:1,name:'SKU A',price:1000,currentStock:20,status:true,images:[]},1)}>Add A</button><button onClick={()=>cart.addItem({id:2,name:'SKU B',price:1000,currentStock:20,status:true,images:[]},1)}>Add B</button>
    <button onClick={()=>navigate('/checkout')}>Checkout</button><button onClick={()=>navigate('/orders')}>Orders</button><button onClick={()=>navigate('/home')}>Home</button>
    <button onClick={()=>run(()=>api.get('/online-orders'))}>Read orders</button>
  </nav>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><CartProvider><CheckoutDraftProvider><CustomerNoticeContext.Provider value={{deliveryInformation:{mode:'LOCAL_FIXED',flatFee:3000}}}>
  <Toaster/><Controls/><Routes><Route path="/home" element={<p>Public</p>}/><Route path="/cart" element={<p>Current cart</p>}/><Route path="/checkout" element={<CheckoutPage/>}/><Route path="/orders" element={<ClientOrdersPage/>}/><Route path="/payment-result" element={<PaymentResultPage/>}/><Route path="/login" element={<p>Login required</p>}/></Routes>
</CustomerNoticeContext.Provider></CheckoutDraftProvider></CartProvider></AuthProvider></BrowserRouter>);
