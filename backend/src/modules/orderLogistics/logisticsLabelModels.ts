import {
  formatOrderDate,
  formatOrderQuantity,
} from "../onlineOrders/orderCommercialModel.js";
import type { LogisticsTask } from "./orderLogistics.repository.js";
import { historicalIdentityNote } from "../products/historicalIdentity.js";

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
  handoffUrl: string | null;
};

export function buildPreparationLabelModel(
  task: LogisticsTask,
  handoffUrl: string | null = null,
): PreparationLabelModel {
  return {
    folio: task.folio,
    modality: task.deliveryType === "DELIVERY" ? "Despacho a domicilio" : "Retiro en tienda",
    date: formatOrderDate(task.paidAt ?? task.createdAt),
    status: task.status,
    items: task.items.map((item) => ({
      productName: `${item.productName}\n${historicalIdentityNote(item.historicalIdentity)}`,
      quantityLabel: formatOrderQuantity(item.quantity, item.unitMeasure),
    })),
    handoffUrl,
  };
}
