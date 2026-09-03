import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authentication.middleware.js";
import { handleErrorClient, handleErrorServer, handleSuccess } from "../../utils/helpers.js";
import { addClientFavorite, findClientFavorites, removeClientFavorite } from "./favorites.repository.js";

export async function listFavorites(req: AuthenticatedRequest, res: Response) {
  try {
    return handleSuccess(res, 200, "Favoritos obtenidos", await findClientFavorites(req.user!.id));
  } catch {
    return handleErrorServer(res, 500, "No se pudieron cargar los favoritos");
  }
}

export async function changeFavorite(req: AuthenticatedRequest, res: Response) {
  const id = Number(req.params.productId);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    return handleErrorClient(res, 400, "Producto inválido");
  }
  if (Object.keys(req.body || {}).length || Object.keys(req.query).length) {
    return handleErrorClient(res, 400, "Solo debe indicar el producto en la ruta");
  }
  try {
    if (req.method === "PUT") {
      if (!await addClientFavorite(req.user!.id, id)) return handleErrorClient(res, 404, "Producto no disponible");
    } else {
      await removeClientFavorite(req.user!.id, id);
    }
    return handleSuccess(res, 200, req.method === "PUT" ? "Favorito guardado" : "Favorito eliminado");
  } catch {
    return handleErrorServer(res, 500, "No se pudo actualizar el favorito");
  }
}
