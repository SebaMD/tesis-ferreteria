import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
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

function databaseError(error: unknown) {
  let current = error;

  while (typeof current === "object" && current !== null) {
    const record = current as Record<string, unknown>;

    if (typeof record.code === "string") {
      return {
        code: record.code,
        constraint: typeof record.constraint === "string" ? record.constraint : "",
        detail: typeof record.detail === "string" ? record.detail : "",
      };
    }

    current = record.cause;
  }

  return null;
}

function uniqueUserMessage(error: unknown) {
  const dbError = databaseError(error);
  if (dbError?.code !== "23505") return null;

  const errorContext = `${dbError.constraint} ${dbError.detail}`.toLocaleLowerCase();

  if (errorContext.includes("rut")) return "El RUT ya está registrado";
  if (errorContext.includes("correo") || errorContext.includes("email")) {
    return "El correo electrónico ya está registrado";
  }

  return "Ya existe un usuario con estos datos";
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
    const duplicateMessage = uniqueUserMessage(error);
    if (duplicateMessage) return handleErrorClient(res, 409, duplicateMessage);

    const message = getErrorMessage(error);
    if (
      message === "Debe seleccionar un rol valido" ||
      message === "No se puede cambiar el rol de un usuario administrador" ||
      message === "No se puede cambiar el estado de un usuario administrador"
    ) {
      return handleErrorClient(res, 400, message);
    }

    return handleErrorServer(res, 500, "Error al crear usuario", message);
  }
}

export async function editUser(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return handleErrorClient(res, 400, "El id del usuario debe ser un numero valido");
    }

    const validation = validateEditUserBody(req.body);

    if (!validation.success) {
      return handleErrorClient(res, 400, "Parametros invalidos", validation.error);
    }

    const updatedUser = await editUserService(userId, validation.value, req.user?.id);
    return handleSuccess(res, 200, "Usuario actualizado exitosamente", updatedUser);
  } catch (error) {
    const message = getErrorMessage(error);

    if (message === "Usuario no encontrado") {
      return handleErrorClient(res, 404, message);
    }

    const duplicateMessage = uniqueUserMessage(error);
    if (duplicateMessage) return handleErrorClient(res, 409, duplicateMessage);

    if (
      message === "Debe seleccionar un rol valido" ||
      message === "Usuario autenticado no valido" ||
      message === "No puedes cambiar tu propio rol de administrador" ||
      message === "No puedes cambiar el estado de tu propia cuenta de administrador" ||
      message === "No se puede cambiar el estado de un usuario administrador"
    ) {
      return handleErrorClient(res, 400, message);
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

export async function deleteUser(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return handleErrorClient(res, 400, "El id del usuario debe ser un numero valido");
    }

    const result = await deleteUserService(userId, req.user?.id);

    if (!result) {
      return handleErrorClient(res, 404, "Usuario no encontrado");
    }

    return handleSuccess(res, 200, "Usuario eliminado exitosamente");
  } catch (error) {
    const message = getErrorMessage(error);

    if (databaseError(error)?.code === "23503") {
      return handleErrorClient(
        res,
        409,
        "No se puede eliminar este usuario porque tiene ventas o movimientos de inventario asociados",
      );
    }

    if (
      message === "Usuario autenticado no valido" ||
      message === "No puedes eliminar tu propio usuario" ||
      message === "No se puede eliminar este administrador porque el sistema quedaria sin administradores activos"
    ) {
      return handleErrorClient(res, 400, message);
    }

    return handleErrorServer(res, 500, "Error al eliminar usuario", message);
  }
}
