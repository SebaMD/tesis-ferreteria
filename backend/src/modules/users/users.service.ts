import bcrypt from "bcrypt";
import { db } from "../../db/index.js";
import type { NewUser } from "../../db/schema/index.js";
import {
  countActiveAdminUsers,
  createUser,
  deleteUserById,
  findBlockingClientCommerce,
  findClientForDeactivation,
  findRoleById,
  findRoles,
  findOtherUserByRut,
  findUserById,
  findUsers,
  invalidateClientTemporaryCredentials,
  markClientSelfDeactivated,
  updateUserById,
  updateUserByIdAndInvalidateSessions,
  updateUserWorkScheduleById,
} from "./users.repository.js";
import type { CashierScheduleBody, ClientDeactivationBody, ClientProfileBody, CreateUserBody, EditUserBody } from "./users.validation.js";
import { createSessionForUserId } from "../auth/auth.service.js";

export async function getUsersService() {
  return findUsers();
}

export async function getUserRolesService() {
  return findRoles();
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

  if (await findOtherUserByRut(data.rut)) {
    throw new Error("El RUT ya está registrado");
  }

  const user = await createUser({
    ...data,
    emailVerifiedAt: role.name === "ADMIN" ? new Date() : null,
    password: await bcrypt.hash(data.password, 10),
  });

  return user;
}

export async function editUserService(id: number, data: EditUserBody, authenticatedUserId?: number) {
  if (!authenticatedUserId) {
    throw new Error("Usuario autenticado no valido");
  }

  const user = await findUserById(id);

  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  const userData: Partial<NewUser> = { ...data };
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

  const targetRole = nextRole?.name ?? user.roleName;
  const emailChanged = userData.correo !== undefined && userData.correo !== user.correo;
  if (userData.rut !== undefined && userData.rut !== user.rut && await findOtherUserByRut(userData.rut, id)) {
    throw new Error("El RUT ya está registrado");
  }
  if (emailChanged) {
    Object.assign(userData, { emailVerifiedAt: targetRole === "ADMIN" ? new Date() : null });
  }

  const roleChanged = userData.roleId !== undefined && userData.roleId !== user.roleId;
  const statusChanged = userData.status !== undefined && userData.status !== user.status;
  const passwordChanged = Boolean(userData.password);
  const invalidateSessions = roleChanged || statusChanged || passwordChanged || emailChanged;

  if (userData.status !== undefined) {
    userData.selfDeactivatedAt = null;
  }

  const updatedUser = invalidateSessions
    ? await updateUserByIdAndInvalidateSessions(id, userData)
    : await updateUserById(id, userData);

  if (!updatedUser) {
    throw new Error("Usuario no encontrado");
  }

  return updatedUser;
}

export class ClientAccountError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "ClientAccountError";
  }
}

export async function deactivateClientAccountService(userId: number, data: ClientDeactivationBody) {
  return db.transaction(async (tx) => {
    const user = await findClientForDeactivation(tx, userId);
    if (!user || user.role !== "CLIENT" || user.status !== "ACTIVE") {
      throw new ClientAccountError("La cuenta de cliente no está activa", 403);
    }
    if (!await bcrypt.compare(data.password, user.password)) {
      throw new ClientAccountError("Contraseña incorrecta.", 400);
    }
    if (await findBlockingClientCommerce(tx, userId)) {
      throw new ClientAccountError(
        "No puedes desactivar tu cuenta mientras exista una compra o entrega en proceso.",
        409,
      );
    }

    const now = new Date();
    const updated = await markClientSelfDeactivated(tx, userId, now);
    if (!updated) throw new ClientAccountError("La cuenta ya no se encuentra activa", 409);
    await invalidateClientTemporaryCredentials(tx, userId, now);
    return { deactivatedAt: now.toISOString() };
  });
}

export async function updateClientProfileService(userId: number, data: ClientProfileBody) {
  const user = await findUserById(userId);
  if (!user || user.roleName !== "CLIENT" || user.status !== "ACTIVE") {
    throw new Error("La cuenta de cliente no está activa");
  }
  const updated = await updateUserById(userId, { phone: data.phone });
  if (!updated) throw new Error("Usuario no encontrado");
  return createSessionForUserId(userId);
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
