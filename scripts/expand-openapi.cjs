/* One-off expander: node docs/scripts/expand-openapi.cjs */
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "../api-reference/openapi.json");
const o = JSON.parse(fs.readFileSync(p, "utf8"));

o.info.description =
  "Paths below match `https://api.dancity.app` + global prefix `api`. Merchant: `Authorization: Bearer dcy_live_...` and `channel: API`. App: JWT. See Guides for flows.";

o.tags = [
  { "name": "VAS", "description": "Merchant API (`/api/external/v1`): catalog GETs (wallet, services, products, plans) and purchase routes; `channel: API` on POST buys; app education & betting where listed" },
  { "name": "Products & services", "description": "One GET for services, one for products, and one per plan type, each with query filters" },
  { "name": "Wallet", "description": "Get wallet by id (JWT)" },
  { "name": "Transactions", "description": "Fetch your transactions and requery one by id for current status" },
  { "name": "Betting", "description": "Betting funding" },
  { "name": "Education", "description": "Education pins" },
  { "name": "eSIM", "description": "eSIM catalog and purchase" },
  { "name": "Virtual card", "description": "Cards" },
  { "name": "Models", "description": "Enums and payload shapes" },
];

o.components.schemas = {
  ...o.components.schemas,
  ServiceStatus: {
    type: "string",
    enum: ["SUCCESS", "FAILED", "PROCESSING", "PENDING", "CANCELLED"],
    description: "Transaction service status (internal)",
  },
  TranxType: { type: "string", enum: ["DEBIT", "CREDIT"] },
  PartnerWebhookPayload: {
    type: "object",
    description: "POST body Dancity sends to your configured HTTPS webhook URL (set in the Dancity app / API key settings).",
    properties: {
      event: { type: "string", example: "transaction.success" },
      timestamp: { type: "string", format: "date-time" },
      data: { type: "object", additionalProperties: true },
    },
  },
};

const jwt = [{ JwtAuth: [] }];
const ext = [{ DancityApiKey: [], ChannelHeader: [] }];
/** Read-only merchant catalog; only API key (no `channel` header). */
const extKey = [{ DancityApiKey: [] }];

const ok = {
  description: "OK",
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
};

const extraPaths = {
  "/api/service": {
    get: {
      tags: ["Products & services"],
      summary: "Get services",
      description:
        "One endpoint for services: use query parameters to filter, or pass `id` to return a single service. `GET /api/service/{id}` is still supported for the same by-id result.",
      security: jwt,
      parameters: [
        { name: "id", in: "query", description: "Optional. Service Mongo id — when set, response is a single `service` object.", schema: { type: "string" } },
        { name: "name", in: "query", schema: { type: "string" } },
        { name: "disable", in: "query", schema: { type: "boolean" } },
        { name: "displayonmenu", in: "query", schema: { type: "boolean" } },
        { name: "isutility", in: "query", schema: { type: "boolean" } },
      ],
      responses: {
        200: { description: "OK" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/api/products": {
    get: {
      tags: ["Products & services"],
      summary: "Get products",
      description:
        "Fetch products with optional filters. `GET /api/products` and the legacy `GET /api/products/product` path are the same handler.",
      security: jwt,
      parameters: [
        { name: "productId", in: "query", schema: { type: "string" } },
        { name: "name", in: "query", schema: { type: "string" } },
        { name: "service", in: "query", schema: { type: "string" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/plans/data": {
    get: {
      tags: ["Products & services"],
      summary: "Get data plans",
      description: "Filter data plans with query parameters (product, plan id, promos, bucket plans, etc.).",
      security: jwt,
      parameters: [
        { name: "planId", in: "query", schema: { type: "string" } },
        { name: "product", in: "query", schema: { type: "string" } },
        { name: "isHotDeal", in: "query", schema: { type: "boolean" } },
        { name: "isbucketplan", in: "query", schema: { type: "boolean" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/plans/cable": {
    get: {
      tags: ["Products & services"],
      summary: "Get cable plans",
      description: "Filter cable plans by `cableplanId` and `product` as needed.",
      security: jwt,
      parameters: [
        { name: "cableplanId", in: "query", schema: { type: "string" } },
        { name: "product", in: "query", schema: { type: "string" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/internetplans": {
    get: {
      tags: ["Products & services"],
      summary: "Get internet plans",
      description: "Filter internet plans with `internetid`, `product`, and optional `action=FILTER` when applicable.",
      security: jwt,
      parameters: [
        { name: "internetid", in: "query", schema: { type: "string" } },
        { name: "product", in: "query", schema: { type: "string" } },
        { name: "action", in: "query", schema: { type: "string", enum: ["FILTER"] } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/wallet/{id}": {
    get: {
      tags: ["Wallet"],
      summary: "Get wallet",
      description:
        "Returns the wallet for the authenticated user. Use the wallet id from your app's user or session context.",
      security: jwt,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/transactions/{transactionId}": {
    get: {
      tags: ["Transactions"],
      summary: "Requery transaction",
      description:
        "Return one transaction and its current `status` by Mongo `_id` or by `tranxId`. Use to requery after a purchase or for polling. Typical `status` values include `SUCCESS`, `FAILED`, `PROCESSING`, `PENDING`, `CANCELLED`.",
      security: jwt,
      parameters: [
        {
          name: "transactionId",
          in: "path",
          required: true,
          description: "Mongo id or external `tranxId` (same path segment).",
          schema: { type: "string" },
        },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/betting/funding": {
    post: {
      tags: ["Betting"],
      summary: "Fund betting account",
      security: jwt,
      parameters: [
        {
          name: "channel",
          in: "header",
          required: false,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["product", "customerIdentifier", "amount", "pin"],
              properties: {
                product: { type: "string" },
                customerIdentifier: { type: "string" },
                amount: { type: "number", minimum: 100 },
                pin: { type: "string" },
                customerRef: { type: "string" },
                saveAsBeneficiary: { type: "boolean" },
                beneficiaryName: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "OK" }, 400: { description: "Bad request" } },
    },
  },
  "/api/education-pin/purchase": {
    post: {
      tags: ["Education"],
      summary: "Purchase education pin",
      security: jwt,
      parameters: [{ name: "channel", in: "header", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["quantity", "product", "pin"],
              properties: {
                quantity: { type: "number" },
                product: { type: "string" },
                customerRef: { type: "string" },
                promocode: { type: "string" },
                pin: { type: "string" },
                deviceKey: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/education-pin/validate-product": {
    post: {
      tags: ["Education"],
      summary: "Validate education product / pricing",
      security: jwt,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["product", "quantity"],
              properties: { product: { type: "string" }, quantity: { type: "number" } },
            },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/esim/regions": {
    get: {
      tags: ["eSIM"],
      summary: "eSIM regions",
      security: jwt,
      parameters: [{ name: "type", in: "query", schema: { type: "number", description: "1=country, 2=multi" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/esim/packages": {
    get: {
      tags: ["eSIM"],
      summary: "eSIM packages for region",
      security: jwt,
      parameters: [
        { name: "regionCode", in: "query", required: true, schema: { type: "string", example: "NG" } },
        { name: "regionType", in: "query", schema: { type: "string" } },
        { name: "type", in: "query", schema: { type: "string", enum: ["BASE", "TOPUP"] } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/esim/topup-packages": {
    get: {
      tags: ["eSIM"],
      summary: "Top-up packages for ICCID",
      security: jwt,
      parameters: [{ name: "iccid", in: "query", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/esim/purchase": {
    post: {
      tags: ["eSIM"],
      summary: "Purchase eSIM",
      security: jwt,
      parameters: [{ name: "channel", in: "header", required: false, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["packageCode", "wallettype", "pin"],
              properties: {
                packageCode: { type: "string" },
                wallettype: { type: "string", example: "main" },
                pin: { type: "string" },
                customerRef: { type: "string" },
                promocode: { type: "string" },
                deviceKey: { type: "string" },
                saveAsBeneficiary: { type: "boolean" },
                beneficiaryName: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/esim/my-esims": {
    get: {
      tags: ["eSIM"],
      summary: "List user eSIMs",
      security: jwt,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/esim/details/{transactionId}": {
    get: {
      tags: ["eSIM"],
      summary: "eSIM details for transaction",
      security: jwt,
      parameters: [
        { name: "transactionId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/cards": {
    get: {
      tags: ["Virtual card"],
      summary: "List virtual cards",
      security: jwt,
      responses: { 200: { description: "OK" } },
    },
    post: {
      tags: ["Virtual card"],
      summary: "Create virtual card",
      security: jwt,
      requestBody: {
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      },
      responses: { 201: { description: "Created" } },
    },
  },
  "/api/cards/exchange-rate": {
    get: {
      tags: ["Virtual card"],
      summary: "Card USD/FX rates",
      security: jwt,
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/cards/transactions/{cardId}": {
    get: {
      tags: ["Virtual card"],
      summary: "Card transactions",
      security: jwt,
      parameters: [
        { name: "cardId", in: "path", required: true, schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/cards/wallet": {
    post: {
      tags: ["Virtual card"],
      summary: "Fund or withdraw from card",
      security: jwt,
      requestBody: {
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      },
      responses: { 201: { description: "OK" } },
    },
  },
  "/api/cards/{cardId}": {
    get: {
      tags: ["Virtual card"],
      summary: "Get card by ID",
      security: jwt,
      parameters: [{ name: "cardId", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
    put: {
      tags: ["Virtual card"],
      summary: "Update card",
      security: jwt,
      parameters: [{ name: "cardId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      },
      responses: { 200: { description: "OK" } },
    },
  },
  "/api/external/v1/wallet": {
    get: {
      tags: ["VAS"],
      summary: "Wallets and balances (merchant, API key)",
      description:
        "Same data as app `GET /api/wallet`: wallets and balances for the user linked to this API key.",
      security: extKey,
      responses: { 200: ok, 401: { description: "Invalid API key or IP not allowlisted" } },
    },
  },
  "/api/external/v1/wallet/{id}": {
    get: {
      tags: ["VAS"],
      summary: "Single wallet (merchant, API key)",
      description: "Wallet must belong to the API key’s linked user.",
      security: extKey,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok,
        401: { description: "Invalid API key or IP not allowlisted" },
        404: { description: "Not found" },
      },
    },
  },
  "/api/external/v1/services": {
    get: {
      tags: ["VAS"],
      summary: "List/filter services (merchant, API key)",
      description: "Same filters as app `GET /api/service` (`id`, `name`, `disable`, ...).",
      security: extKey,
      parameters: [
        { name: "id", in: "query", schema: { type: "string" } },
        { name: "name", in: "query", schema: { type: "string" } },
        { name: "disable", in: "query", schema: { type: "boolean" } },
        { name: "displayonmenu", in: "query", schema: { type: "boolean" } },
        { name: "isutility", in: "query", schema: { type: "boolean" } },
      ],
      responses: { 200: ok, 401: { description: "Invalid API key or IP not allowlisted" } },
    },
  },
  "/api/external/v1/services/{id}": {
    get: {
      tags: ["VAS"],
      summary: "Service by id (merchant, API key)",
      security: extKey,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: ok, 401: { description: "Invalid API key or IP not allowlisted" } },
    },
  },
  "/api/external/v1/products": {
    get: {
      tags: ["VAS"],
      summary: "Products available to buy (merchant, API key)",
      description: "Filter with `productId`, `name`, or `service` (service name) like `GET /api/products`.",
      security: extKey,
      parameters: [
        { name: "productId", in: "query", schema: { type: "string" } },
        { name: "name", in: "query", schema: { type: "string" } },
        { name: "service", in: "query", schema: { type: "string" } },
      ],
      responses: { 200: ok, 401: { description: "Invalid API key or IP not allowlisted" } },
    },
  },
  "/api/external/v1/plans/data": {
    get: {
      tags: ["VAS"],
      summary: "Data plans (merchant, API key)",
      description: "Filter by `product`, `planId`, `isHotDeal`, `isbucketplan` — same as app `GET /api/plans/data`.",
      security: extKey,
      parameters: [
        { name: "planId", in: "query", schema: { type: "string" } },
        { name: "product", in: "query", schema: { type: "string" } },
        { name: "isHotDeal", in: "query", schema: { type: "boolean" } },
        { name: "isbucketplan", in: "query", schema: { type: "boolean" } },
      ],
      responses: { 200: ok, 401: { description: "Invalid API key or IP not allowlisted" } },
    },
  },
  "/api/external/v1/plans/cable": {
    get: {
      tags: ["VAS"],
      summary: "Cable plans (merchant, API key)",
      description: "Filter with `cableplanId` and `product` like `GET /api/plans/cable`.",
      security: extKey,
      parameters: [
        { name: "cableplanId", in: "query", schema: { type: "string" } },
        { name: "product", in: "query", schema: { type: "string" } },
      ],
      responses: { 200: ok, 401: { description: "Invalid API key or IP not allowlisted" } },
    },
  },
  "/api/external/v1/plans/internet": {
    get: {
      tags: ["VAS"],
      summary: "Internet plans (merchant, API key)",
      description: "Filter with `internetid`, `product`, `action` like `GET /api/internetplans`.",
      security: extKey,
      parameters: [
        { name: "internetid", in: "query", schema: { type: "string" } },
        { name: "product", in: "query", schema: { type: "string" } },
        { name: "action", in: "query", schema: { type: "string", enum: ["FILTER"] } },
      ],
      responses: { 200: ok, 401: { description: "Invalid API key or IP not allowlisted" } },
    },
  },
};

o.paths = { ...o.paths, ...extraPaths };
for (const k of Object.keys(o.paths)) {
  if (k.startsWith("/api/api-client")) delete o.paths[k];
}

o.webhooks = {
  partnerTransaction: {
    post: {
      tags: ["Models"],
      summary: "Inbound webhook (Dancity → your HTTPS URL)",
      description: "Server-to-server POST. Verify signature as in Guides → Webhook.",
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PartnerWebhookPayload" },
          },
        },
      },
      responses: { 200: { description: "Return 2xx to acknowledge" } },
    },
  },
};

fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
console.log("Wrote", p, "paths:", Object.keys(o.paths).length);
