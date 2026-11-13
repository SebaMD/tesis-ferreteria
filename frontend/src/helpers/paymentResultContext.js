// A protected 404 deliberately does not reveal whether somebody else's order exists.
export function paymentResultAccessMessage(status) {
  if (status === 401 || status === 403) return 'Inicia sesión con la cuenta que realizó esta compra y consulta Mis pedidos. Este retorno no autoriza el acceso al pedido.';
  if (status === 404) return 'No pudimos recuperar este pedido para la sesión actual. Consulta Mis pedidos con la cuenta que compró o utiliza el enlace seguro de la compra invitada.';
  return null;
}
