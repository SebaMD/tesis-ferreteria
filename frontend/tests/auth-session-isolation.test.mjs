import test from 'node:test';
import assert from 'node:assert/strict';
import {readAuthSnapshot,storeAuthSession,clearStoredAuth,AUTH_SESSION_KEY} from '../src/helpers/session.js';
import {claimCheckoutOwner} from '../src/helpers/checkoutOwner.js';
function fixture(){
 const original={localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,window:globalThis.window};
 const storage=()=>{const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
 globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.window={atob:s=>Buffer.from(s,'base64').toString('binary'),dispatchEvent:()=>{}};
 return()=>{for(const [k,v]of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}};
}
const token=(id,exp=Date.now()/1000+3600)=>`e30.${Buffer.from(JSON.stringify({id,exp})).toString('base64url')}.signature`;
test('JWT subject and displayed user must agree; uncommitted legacy pair cannot cross identities',()=>{
 const restore=fixture();try{
 storeAuthSession(token(1),{id:1,role:'CLIENT'});assert.equal(readAuthSnapshot().user.id,1);
 localStorage.setItem('token',token(2));assert.equal(readAuthSnapshot().token,null);
 localStorage.setItem('user',JSON.stringify({id:2,role:'CLIENT'}));assert.equal(readAuthSnapshot().token,null);
 storeAuthSession(token(2),{id:2,role:'CLIENT'});assert.equal(readAuthSnapshot().user.id,2);
 }finally{restore();}
});
test('legacy sessions stay readable only with matching, unexpired JWT subject',()=>{
 const restore=fixture();try{
 localStorage.setItem('token',token(1));localStorage.setItem('user',JSON.stringify({id:1}));assert.equal(readAuthSnapshot().user.id,1);
 localStorage.setItem('user',JSON.stringify({id:2}));assert.equal(readAuthSnapshot().token,null);
 localStorage.setItem('token',token(2,1));assert.equal(readAuthSnapshot().token,null);
 }finally{restore();}
});
test('logout removes auth envelope but preserves separately owned carts',()=>{
 const restore=fixture();try{
 storeAuthSession(token(1),{id:1});localStorage.setItem('fyf_client_cart_client_1','cart A');localStorage.setItem('fyf_client_cart_client_2','cart B');clearStoredAuth();
 assert.equal(localStorage.getItem(AUTH_SESSION_KEY),null);assert.equal(readAuthSnapshot().token,null);
 assert.equal(localStorage.getItem('fyf_client_cart_client_1'),'cart A');assert.equal(localStorage.getItem('fyf_client_cart_client_2'),'cart B');
 }finally{restore();}
});
test('checkout history stays bound to original owner across reload, account changes and POP',()=>{
 const restore=fixture();try{
 assert.equal(claimCheckoutOwner(sessionStorage,'old-history','CLIENT:1'),true);
 assert.equal(claimCheckoutOwner(sessionStorage,'old-history','CLIENT:2'),false);
 assert.equal(claimCheckoutOwner(sessionStorage,'old-history','CLIENT:1'),true);
 assert.equal(claimCheckoutOwner(sessionStorage,'new-history','CLIENT:2'),true);
 assert.equal(claimCheckoutOwner(sessionStorage,'old-history','GUEST'),false);
 assert.equal(claimCheckoutOwner({getItem(){throw Error('blocked');}},'x','CLIENT:1'),false);
 }finally{restore();}
});
