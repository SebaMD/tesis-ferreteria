/* eslint-disable react-refresh/only-export-components -- standalone browser fixture */
import {StrictMode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AuthContext from '../../src/context/AuthContext.js';
import ThemeProvider from '../../src/context/ThemeProvider.jsx';
import useTheme from '../../src/hooks/useTheme.js';
import LoadingOverlay from '../../src/components/LoadingOverlay.jsx';
import '../../src/styles/styles.css';
function View(){
 const {theme,toggleTheme}=useTheme();const [active,setActive]=useState(false),[present,setPresent]=useState(true),[internal,setInternal]=useState(false);
 return <><header data-loading-navbar style={{position:'fixed',top:0,left:0,right:0,height:72,zIndex:30,background:'white',display:'flex',flexWrap:'nowrap',overflow:'auto',alignItems:'center'}}><output data-testid="theme">{theme}</output><button onClick={toggleTheme}>Theme</button><button onClick={()=>{setPresent(true);setActive(true);}}>Load</button><button onClick={()=>setActive(false)}>Error</button><button onClick={()=>setPresent(false)}>Leave</button><button onClick={()=>setInternal(v=>!v)}>Internal</button></header>
 <aside data-loading-sidebar style={{position:'fixed',top:72,left:0,width:internal?256:0,height:'100vh'}}/>
 <section style={{marginTop:90,transform:'translateX(41px)',overflow:'hidden',width:'75%'}}><p>Behind overlay</p>{present&&<LoadingOverlay active={active}/>}</section></>;
}
function Fixture(){const [id,setId]=useState(1);return <AuthContext.Provider value={{user:id?{id}:null}}><ThemeProvider key={id||'guest'}><View/></ThemeProvider><div style={{position:'fixed',bottom:0,zIndex:100}}><button onClick={()=>setId(1)}>Account A</button><button onClick={()=>setId(2)}>Account B</button><button onClick={()=>setId(null)}>Logout</button></div></AuthContext.Provider>;}
createRoot(document.getElementById('root')).render(<StrictMode><Fixture/></StrictMode>);
