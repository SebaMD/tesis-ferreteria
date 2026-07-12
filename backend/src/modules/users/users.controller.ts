import type { Request, Response } from "express";
import {
  handleErrorClient,
  handleErrorServer,
  handleSuccess,
} from "../../utils/helpers.js";
import {
  createUserService,
  deleteUserService,
  editUserService,
  getUserByIdService,
  getUsersService,
  updateCashierScheduleService,
} from "./users.service.js";
import { validateCashierScheduleBody, validateCreateUserBody, validateEditUserBody } from "./users.validation.js";

function parseId(id: unknown) {
  if (typeof id !== "string") return null;

  const userId = Number(id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function getUsers(_req: Request, res: Response) {
  try {
    const users = await getUsersService();

    if (users.length < 1) {
      return handleSuccess(res, 200, "No hay usuarios registrados", []);
    }

    return handleSuccess(res, 200, "Usuarios obtenidos exitosamente", users);
  } catch (error) {
    return handleErrorServer(res, 500, "Error al obtener usuarios", getErrorMessage(error));
  }
}

export async function getUserById(req: Request, res: Response) {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return handleErrorClient(res, 400, "El id del usuario debe ser un numero valido");
    }

    const user = await getUserByIdService(userId);
    return handleSuccess(res, 200, "Usuario encontrado", user);
  } catch (error) {
    const message = getErrorMessage(error);

    if (message === "Usuario no encontrado") {
      return handleErrorClient(res, 404, message);
    }

    return handleErrorServer(res, 500, "Error al obtener el usuario", message);
  }
}

export async function createUser(req: Request, res: Response) {
  try {
    const validation = validateCreateUserBody(req.body);

    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const user = await createUserService(validation.value);
    return handleSuccess(res, 201, "Usuario creado exitosamente", user);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return handleErrorClient(res, 409, "Ya existe un usuario con estos datos");
    }

    return handleErrorServer(res, 500, "Error al crear usuario", getErrorMessage(error));
  }
}

export async function editUser(req: Request, res: Response) {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return handleErrorClient(res, 400, "El id del usuario debe ser un numero valido");
    }

    const validation = validateEditUserBody(req.body);

    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const updatedUser = await editUserService(userId, validation.value);
    return handleSuccess(res, 200, "Usuario actualizado exitosamente", updatedUser);
  } catch (error) {
    const message = getErrorMessage(error);

    if (message === "Usuario no encontrado") {
      return handleErrorClient(res, 404, message);
    }

    if (isUniqueConstraintError(error)) {
      return handleErrorClient(res, 409, "Ya existe un usuario con estos datos");
    }

    return handleErrorServer(res, 500, "Error interno del servidor", message);
  }
}

export async function updateCashierSchedule(req: Request, res: Response) {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return handleErrorClient(res, 400, "El id del usuario debe ser un numero valido");
    }

    const validation = validateCashierScheduleBody(req.body);

    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const updatedUser = await updateCashierScheduleService(userId, validation.value);
    return handleSuccess(res, 200, "Horario de cajero actualizado exitosamente", updatedUser);
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    if (errorMessage === "Usuario no encontrado") {
      return handleErrorClient(res, 404, errorMessage);
    }

    if (errorMessage === "El horario solo puede configurarse para usuarios cajeros") {
      return handleErrorClient(res, 400, errorMessage);
    }

    return handleErrorServer(res, 500, "Error al actualizar horario de cajero", errorMessage);
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return handleErrorClient(res, 400, "El id del usuario debe ser un numero valido");
    }

    const result = await deleteUserService(userId);

    if (!result) {
      return handleErrorClient(res, 404, "Usuario no encontrado");
    }

    return handleSuccess(res, 200, "Usuario eliminado exitosamente");
  } catch (error) {
    return handleErrorServer(res, 500, "Error al eliminar usuario", getErrorMessage(error));
  }
}
