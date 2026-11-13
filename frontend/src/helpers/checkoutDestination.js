import { DELIVERY_COMMUNE } from './delivery.js';

export const EMPTY_CHECKOUT_DESTINATION = { deliveryRecipientName: '', deliveryPhone: '', deliveryAddress: '', deliveryReference: '' };
export function savedCheckoutDestination(saved) {
  if (!saved) return { values: {}, note: '' };
  const covered = typeof saved.commune === 'string'
    && saved.commune.trim().replace(/\s+/g, ' ').localeCompare(DELIVERY_COMMUNE, 'es', { sensitivity: 'base' }) === 0;
  const values = { deliveryRecipientName: saved.recipientName || '', deliveryPhone: saved.phone || '' };
  if (!covered) return { values, note: 'La dirección guardada no tiene una comuna válida de Santa Juana. No se utilizó como destino; ingresa una dirección dentro de la cobertura.' };
  values.deliveryAddress = saved.address || '';
  values.deliveryReference = saved.reference || '';
  return { values, note: !values.deliveryAddress.trim() || !values.deliveryRecipientName.trim() || !/^[+0-9()\s-]{7,20}$/.test(values.deliveryPhone)
    ? 'La dirección guardada está incompleta. Revisa y completa los datos de entrega antes de pagar.' : '' };
}
export function mergeSavedCheckoutDestination(current, touched, saved) {
  const { values } = savedCheckoutDestination(saved);
  return Object.fromEntries(Object.keys(EMPTY_CHECKOUT_DESTINATION).map(key => [key,
    touched[key] || current[key] ? current[key] : String(values[key] || ''),
  ]));
}

export function savedCheckoutAddressIsUsable(saved) {
  const { values, note } = savedCheckoutDestination(saved);
  return Boolean(saved && !note && values.deliveryRecipientName?.trim() && values.deliveryAddress?.trim());
}
