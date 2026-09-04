import {
  formatOrderDate,
  formatOrderQuantity,
} from "../onlineOrders/orderCommercialModel.js";
import type { LogisticsTask } from "./orderLogistics.repository.js";

type OperationalLabelItem = {
  productName: string;
  quantityLabel: string;
};

export type PreparationLabelModel = {
  folio: string;
  modality: "Retiro en tienda" | "Despacho a domicilio";
  date: string;
  status: string;
  items: OperationalLabelItem[];
};

export type DispatchLabelModel = {
  folio: string;
  modality: "Despacho a domicilio";
  date: string;
  recipientName: string;
  phone: string;
  address: string;
  commune: string;
  reference: string | null;
};

export function buildPreparationLabelModel(task: LogisticsTask): PreparationLabelModel {
  return {
    folio: task.folio,
    modality: task.deliveryType === "DELIVERY" ? "Despacho a domicilio" : "Retiro en tienda",
    date: formatOrderDate(task.paidAt ?? task.createdAt),
    status: task.status,
    items: task.items.map((item) => ({
      productName: item.productName,
      quantityLabel: formatOrderQuantity(item.quantity, item.unitMeasure),
    })),
  };
}

export function buildDispatchLabelModel(task: LogisticsTask): DispatchLabelModel {
  if (task.deliveryType !== "DELIVERY") {
    throw new Error("La etiqueta de despacho solo corresponde a entregas a domicilio.");
  }

  return {
    folio: task.folio,
    modality: "Despacho a domicilio",
    date: formatOrderDate(task.deliveryStartedAt ?? task.paidAt ?? task.createdAt),
    recipientName: task.deliveryRecipientName?.trim() || "Destinatario no registrado",
    phone: task.deliveryPhone?.trim() || "Teléfono no registrado",
    address: task.deliveryAddress?.trim() || "Dirección no registrada",
    commune: task.deliveryCommune?.trim() || "Comuna no registrada",
    reference: task.deliveryReference?.trim() || null,
  };
}
