import { sql } from "drizzle-orm";
import { deliveryPolicyRevisionsTable as revisions, onlineOrdersTable as orders } from "../../db/schema/index.js";
export const orderAmountColumns = {
  productsSubtotal: orders.productsSubtotal, productsDiscountTotal: orders.productsDiscountTotal,
  deliveryFee: orders.deliveryFee, deliveryPolicyRevisionId: orders.deliveryPolicyRevisionId,
  deliveryFeeReason: orders.deliveryFeeReason,
  deliveryIsDemo: sql<boolean | null>`(select ${revisions.isDemo} from ${revisions} where ${revisions.id} = ${orders.deliveryPolicyRevisionId})`,
};
