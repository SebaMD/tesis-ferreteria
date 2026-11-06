/* eslint-disable react-refresh/only-export-components -- standalone browser fixture */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CustomerNoticeContext from '../../src/context/CustomerNoticeContext.js';
import DeliverySettingsManager from '../../src/components/DeliverySettingsManager.jsx';
import DeliveryNoticeImage from '../../src/components/DeliveryNoticeImage.jsx';
import api from '../../src/api/httpClient.js';
import '../../src/styles/styles.css';
if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.classList.add('dark');
function Fixture() {
  const [announcement, setAnnouncement] = useState({ title: 'Aviso publicado anterior', message: 'Sin cambios publicados', kind: 'LOCAL_FIXED' });
  const refreshNotices = async () => { const { data } = await api.get('/customer-notice'); setAnnouncement(data.data.deliveryAnnouncement); };
  return <CustomerNoticeContext.Provider value={{ deliveryAnnouncement: announcement, refreshNotices }}><main className="p-4"><DeliverySettingsManager role="ADMIN"/><DeliveryNoticeImage announcement={announcement} onSaved={refreshNotices}/></main></CustomerNoticeContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
