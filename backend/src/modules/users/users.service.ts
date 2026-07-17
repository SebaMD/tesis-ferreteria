import bcrypt from "bcrypt";
import {
  countActiveAdminUsers,
  createUser,
  deleteUserById,
  findRoleById,
  findUserById,
  findUsers,
  updateUserById,
  updateUserWorkScheduleById,
} from "./users.repository.js";
import type { CashierScheduleBody, CreateUserBody, EditUserBody } from "./users.validation.js";

export async function getUsersService() {
  return findUsers();
}

export async function getUserByIdService(id: number) {
  const user = await findUserById(id);

  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  return user;
}

export async function createUserService(data: CreateUserBody) {
  const role = await findRoleById(data.roleId);

  if (!role) {
    throw new Error("Debe seleccionar un rol valido");
  }

  if (role.name === "ADMIN" && data.status === "INACTIVE") {
    throw new Error("No se puede cambiar el estado de un usuario administrador");
  }

  return createUser({
    ...data,
    password: await bcrypt.hash(data.password, 10),
  });
}

export async function editUserService(id: number, data: EditUserBody, authenticatedUserId?: number) {
  if (!authenticatedUserId) {
    throw new Error("Usuario autenticado no valido");
  }

  const user = await findUserById(id);

  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  const userData = { ...data };
  const nextRole = userData.roleId ? await findRoleById(userData.roleId) : null;

  if (userData.roleId && !nextRole) {
    throw new Error("Debe seleccionar un rol valido");
  }

  const isEditingOwnAdmin = id === authenticatedUserId && user.roleName === "ADMIN";

  if (isEditingOwnAdmin && nextRole && nextRole.name !== "ADMIN") {
    throw new Error("No puedes cambiar tu propio rol de administrador");
  }

  if (isEditingOwnAdmin && userData.status !== undefined && userData.status !== user.status) {
    throw new Error("No puedes cambiar el estado de tu propia cuenta de administrador");
  }

  const nextStatus = userData.status ?? user.status;
  if (user.roleName !== "ADMIN" && nextRole?.name === "ADMIN" && nextStatus === "INACTIVE") {
    throw new Error("No se puede cambiar el estado de un usuario administrador");
  }

  if (userData.password) {
    userData.password = await bcrypt.hash(userData.password, 10);
  }

  const updatedUser = await updateUserById(id, userData);

  if (!updatedUser) {
    throw new Error("Usuario no encontrado");
  }

  return updatedUser;
}

export async function updateCashierScheduleService(id: number, data: CashierScheduleBody) {
  const user = await findUserById(id);

  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  if (user.roleName !== "CASHIER") {
    throw new Error("El horario solo puede configurarse para usuarios cajeros");
  }

  const updatedUser = await updateUserWorkScheduleById(id, data);

  if (!updatedUser) {
    throw new Error("Usuario no encontrado");
  }

  return updatedUser;
}

export async function deleteUserService(id: number, authenticatedUserId?: number) {
  if (!authenticatedUserId) {
    throw new Error("Usuario autenticado no valido");
  }

  if (id === authenticatedUserId) {
    throw new Error("No puedes eliminar tu propio usuario");
  }

  const user = await findUserById(id);

  if (!user) {
    return false;
  }

  if (user.roleName === "ADMIN" && user.status === "ACTIVE") {
    const activeAdminCount = await countActiveAdminUsers();

    if (activeAdminCount <= 1) {
      throw new Error("No se puede eliminar este administrador porque el sistema quedaria sin administradores activos");
    }
  }

  const deletedUser = await deleteUserById(id);
  return Boolean(deletedUser);
}
