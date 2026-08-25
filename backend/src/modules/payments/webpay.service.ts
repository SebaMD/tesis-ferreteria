import transbankSdk from "transbank-sdk";
import {
  FRONTEND_URL,
  WEBPAY_API_KEY,
  WEBPAY_COMMERCE_CODE,
  WEBPAY_ENVIRONMENT,
  WEBPAY_RETURN_URL,
  WEBPAY_TIMEOUT_MS,
} from "../../config/configEnv.js";

const {
  Environment,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  Options,
  WebpayPlus,
} = transbankSdk;

export class WebpayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebpayConfigurationError";
  }
}

function getWebpayTransaction() {
  if (!["integration", "production"].includes(WEBPAY_ENVIRONMENT)) {
    throw new WebpayConfigurationError(
      "WEBPAY_ENVIRONMENT debe ser integration o production",
    );
  }

  for (const [label, value, maximumLength] of [
    ["WEBPAY_RETURN_URL", WEBPAY_RETURN_URL, 256],
    ["FRONTEND_URL", FRONTEND_URL, 500],
  ] as const) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value);
    } catch {
      throw new WebpayConfigurationError(`${label} no contiene una URL valida`);
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol) || value.length > maximumLength) {
      throw new WebpayConfigurationError(`${label} no contiene una URL valida`);
    }

    if (
      WEBPAY_ENVIRONMENT === "production"
      && (parsedUrl.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(parsedUrl.hostname))
    ) {
      throw new WebpayConfigurationError(`${label} debe ser una URL HTTPS publica en produccion`);
    }
  }

  if (WEBPAY_ENVIRONMENT === "production") {
    if (!WEBPAY_COMMERCE_CODE?.trim() || !WEBPAY_API_KEY?.trim()) {
      throw new WebpayConfigurationError(
        "Webpay de produccion no esta configurado. Revise WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY.",
      );
    }

    return new WebpayPlus.Transaction(new Options(
      WEBPAY_COMMERCE_CODE.trim(),
      WEBPAY_API_KEY.trim(),
      Environment.Production,
      WEBPAY_TIMEOUT_MS,
    ));
  }

  return new WebpayPlus.Transaction(new Options(
    IntegrationCommerceCodes.WEBPAY_PLUS,
    IntegrationApiKeys.WEBPAY,
    Environment.Integration,
    WEBPAY_TIMEOUT_MS,
  ));
}

export type WebpayTransactionResult = {
  status?: string;
  response_code?: number;
  amount?: number;
  buy_order?: string;
  session_id?: string;
  authorization_code?: string;
  payment_type_code?: string;
  transaction_date?: string;
};

export async function createWebpayTransaction(data: {
  buyOrder: string;
  sessionId: string;
  amount: number;
}) {
  const response = await getWebpayTransaction().create(
    data.buyOrder,
    data.sessionId,
    data.amount,
    WEBPAY_RETURN_URL,
  ) as { token: string; url: string };

  return response;
}

export async function commitWebpayTransaction(token: string) {
  return getWebpayTransaction().commit(token) as Promise<WebpayTransactionResult>;
}

export async function getWebpayTransactionStatus(token: string) {
  return getWebpayTransaction().status(token) as Promise<WebpayTransactionResult>;
}
