import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyWebpayReturn} from '../dist/modules/onlineOrders/webpayReturn.js';
const ids={TBK_ORDEN_COMPRA:'order-1',TBK_ID_SESION:'session-1'};
test('official parameter shapes classify independently of body/query transport',()=>{
  for(const source of ['body','query']) {
    const classify=v=>classifyWebpayReturn(source==='body'?v:{},source==='query'?v:{});
    assert.deepEqual(classify({token_ws:'token-1'}),{kind:'authorization',token:'token-1'});
    assert.deepEqual(classify(ids),{kind:'expired',buyOrder:'order-1',sessionId:'session-1'});
    assert.equal(classify({...ids,TBK_TOKEN:'token-1'}).kind,'cancelled');
    assert.equal(classify({...ids,TBK_TOKEN:'token-1',token_ws:'token-1'}).kind,'error');
  }
});
test('incomplete, additional, duplicate arrays and contradictory returns cannot make financial decisions',()=>{
  for(const value of [{},{token_ws:''},{TBK_TOKEN:'token-1'},{TBK_ID_SESION:'session-1'},{token_ws:'token-1',...ids},{token_ws:'token-1',TBK_TOKEN:'different',...ids},{token_ws:['token-1','token-2']},{token_ws:'token-1',extra:'yes'},{token_ws:'x'.repeat(65)},{token_ws:' token-1'},{TBK_TOKEN:'token-1',...ids,TBK_ID_SESION:'bad\nvalue'}])assert.equal(classifyWebpayReturn(value,{}).kind,'invalid');
});
test('identical fields across body and query are safe; conflicts are rejected',()=>{
  assert.equal(classifyWebpayReturn({token_ws:'token-1'},{token_ws:'token-1'}).kind,'authorization');
  assert.equal(classifyWebpayReturn({token_ws:'token-1'},{token_ws:'token-2'}).kind,'invalid');
  assert.equal(classifyWebpayReturn({...ids},{TBK_TOKEN:'token-1'}).kind,'cancelled');
});
