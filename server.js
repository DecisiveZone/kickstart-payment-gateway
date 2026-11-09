import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decryptResponse, encryptPayload } from "./ccavenueCrypto.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5500;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "crypto-payment.html"));
});

// Each merchant has its own CCAvenue credentials (from .env).
// Kickstart falls back to the old ACCESS_CODE / WORKING_KEY names.
const MERCHANTS = {
  kickstart: {
    label: "Kickstart - Payments",
    referencePrefix: "KSGQ",
    accessCode: process.env.KICKSTART_ACCESS_CODE || process.env.ACCESS_CODE,
    workingKey: process.env.KICKSTART_WORKING_KEY || process.env.WORKING_KEY,
  },
  firmz: {
    label: "Firmz - Payments",
    referencePrefix: "FZQ",
    accessCode: process.env.FIRMZ_ACCESS_CODE,
    workingKey: process.env.FIRMZ_WORKING_KEY,
  },
};

function buildInvoicePayload({ payerName, reference, amount, currency }) {
  return {
    customer_name: payerName.trim(),
    merchant_reference_no: reference.trim(),
    bill_delivery_type: "NONE",
    currency: currency.trim(),
    valid_for: 30,
    valid_type: "days",
    amount: Number(amount).toFixed(2)
  };
}

function getValidationError(
  { payerName, reference, amount, currency },
  merchantConfig
) {
  if (!merchantConfig) {
    return "Please select a valid merchant.";
  }

  if (!payerName?.trim()) {
    return "Payer name is required.";
  }

  if (!reference?.trim()) {
    return "Invoice reference is required.";
  }

  const prefix = merchantConfig.referencePrefix;
  if (!new RegExp(`^${prefix}\\d+$`).test(reference.trim())) {
    return `Reference must start with ${prefix} followed by digits (e.g., ${prefix}0001).`;
  }

  if (!currency?.trim()) {
    return "Currency is required.";
  }

  if (!Number.isFinite(Number(amount)) || Number(amount) < 1) {
    return "Amount must be at least 1.00.";
  }

  return null;
}

app.post("/generate-quick-invoice", async (req, res) => {
  try {
    const { merchant, payerName, reference, amount, currency } = req.body;
    const merchantConfig = Object.prototype.hasOwnProperty.call(MERCHANTS, merchant)
      ? MERCHANTS[merchant]
      : null;
    const validationError = getValidationError(
      { payerName, reference, amount, currency },
      merchantConfig
    );

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { accessCode, workingKey } = merchantConfig;

    if (!accessCode || !workingKey) {
      return res.status(500).json({
        error: `${merchantConfig.label} credentials are not configured on the server.`,
      });
    }

    const encryptedData = encryptPayload(
      buildInvoicePayload({ payerName, reference, amount, currency }),
      workingKey
    );

    const requestBody = new URLSearchParams({
      enc_request: encryptedData,
      access_code: accessCode,
      request_type: "JSON",
      command: "generateQuickInvoice",
      version: "1.1",
    });

    const response = await fetch(process.env.CCAVENUE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: requestBody.toString(),
    });

    const rawResponse = await response.text();
    const parsedResponse = new URLSearchParams(rawResponse);
    const status = parsedResponse.get("status");
    const encResponse = parsedResponse.get("enc_response");
    const errorCode = parsedResponse.get("enc_error_code");

    if (status === "0" && encResponse) {
      const decryptedResponse = decryptResponse(
        encResponse,
        workingKey
      );
      const invoiceResponse = JSON.parse(decryptedResponse);

      if (invoiceResponse.error_desc || invoiceResponse.error_code) {
        return res.status(400).json({
          error:
            invoiceResponse.error_desc || "Failed to generate quick invoice.",
          code: invoiceResponse.error_code || null,
        });
      }

      return res.json({
        hostedUrl: invoiceResponse.tiny_url,
        invoiceId: invoiceResponse.invoice_id,
      });
    }

    return res.status(response.ok ? 400 : response.status).json({
      error: encResponse || "Failed to generate quick invoice.",
      code: errorCode || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unexpected server error.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});