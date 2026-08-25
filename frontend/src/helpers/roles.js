export const ROLE_NAMES = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  CASHIER: "Cajero",
  WAREHOUSE: "Bodeguero",
  CLIENT: "Cliente",
};

export const ROUTE_PERMISSIONS = {
  dashboard: ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"],
  products: ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"],
  sales: ["ADMIN", "MANAGER", "CASHIER"],
  inventory: ["ADMIN", "MANAGER", "WAREHOUSE"],
  reports: ["ADMIN", "MANAGER"],
  users: ["ADMIN"],
  onlineOrdersManagement: ["ADMIN", "MANAGER", "WAREHOUSE"],
  client: ["CLIENT"],
};
