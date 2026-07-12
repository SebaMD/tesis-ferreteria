import bcrypt from "bcrypt";
import {
  createUser,
  deleteUserById,
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
  return createUser({
    ...data,
    password: await bcrypt.hash(data.password, 10),
  });
}

export async function editUserService(id: number, data: EditUserBody) {
  const user = await findUserById(id);

  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  const userData = { ...data };

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

export async function deleteUserService(id: number) {
  const deletedUser = await deleteUserById(id);
  return Boolean(deletedUser);
}
