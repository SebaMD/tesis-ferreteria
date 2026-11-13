/* eslint-disable react-refresh/only-export-components -- isolated browser entry */
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Toaster} from 'sonner';
import api from '../../src/api/httpClient.js';
import GroupedInventoryTable from '../../src/components/GroupedInventoryTable.jsx';
import FamilyDeactivationDialog from '../../src/components/FamilyDeactivationDialog.jsx';
import {groupInventoryProducts} from '../../src/helpers/inventoryGroups.js';
import '../../src/styles/styles.css';
const initial = [
 ...[1,2,3].map(id=>({id,familyId:18,name:`Familia selectiva · SKU ${id}`,status:false})),
 ...[4,5].map(id=>({id,familyId:19,name:`Familia sin evento · SKU ${id}`,status:false})),
 {id:6,familyId:20,name:'Familia mixta activa',status:true},{id:7,familyId:20,name:'Familia mixta inactiva',status:false},
 {id:8,familyId:null,name:'Producto simple inactivo',status:false},
].map(p=>({...p,categoryId:1,categoryName:'Prueba',unitMeasure:'unidad',currentStock:5,price:1000,minimumStock:0,updatedAt:'2026-11-05T12:00:00Z'}));
window.fixtureProducts=initial;
if(new URLSearchParams(location.search).get('theme')==='dark')document.documentElement.classList.add('dark');
function Fixture(){
 const [products,setProducts]=useState(initial),[target,setTarget]=useState(null);
 return <main className="p-4"><h1>Inventario de prueba</h1><GroupedInventoryTable groups={groupInventoryProducts(products)} allProducts={products} role="ADMIN" userId={1} canManage canViewMinimum onEdit={()=>{}} onStatus={()=>{}} onFamilyStatus={id=>setTarget({id,activate:false})} onFamilyActivate={id=>setTarget({id,activate:true})}/>
 <output className="sr-only" data-testid="states">{JSON.stringify(products.map(p=>[p.id,p.status]))}</output>{target&&<FamilyDeactivationDialog familyId={target.id} userId={1} activate={target.activate} onClose={()=>setTarget(null)} onSaved={async()=>{setProducts((await api.get('/products')).data.data);setTarget(null);}}/>}<Toaster/></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
