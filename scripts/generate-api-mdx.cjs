/**
 * One-off: generate api-reference/* MDX with openapi frontmatter from openapi.json
 * Run: node docs/scripts/generate-api-mdx.cjs
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../api-reference");
const spec = JSON.parse(
  fs.readFileSync(path.join(root, "openapi.json"), "utf8"),
);

function slugifyMethodPath(method, p) {
  const clean = p
    .replace(/^\//, "")
    .replace(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .join("-");
  return `${method.toLowerCase()}-${clean}`.replace(/[^a-z0-9-]/gi, "-");
}

function destFolder(apiPath) {
  if (apiPath.startsWith("/api/external/v1")) return "external-v1";
  if (apiPath.startsWith("/api/service") || apiPath.startsWith("/api/products") || apiPath.startsWith("/api/plans") || apiPath.startsWith("/api/internetplans"))
    return "catalog";
  if (apiPath.startsWith("/api/wallet")) return "wallet";
  if (apiPath.startsWith("/api/transactions")) return "transactions";
  if (apiPath.startsWith("/api/betting")) return "betting";
  if (apiPath.startsWith("/api/education-pin")) return "education";
  if (apiPath.startsWith("/api/esim")) return "esim";
  if (apiPath.startsWith("/api/cards")) return "virtual-card";
  return "misc";
}

const pages = [];

for (const [p, ops] of Object.entries(spec.paths || {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) continue;
    const M = method.toUpperCase();
    const folder = destFolder(p);
    const name = `${slugifyMethodPath(M, p)}.mdx`;
    const relp = `api-reference/${folder}/${name}`;
    const fpath = path.join(__dirname, "..", relp);
    const title = (op.summary || `${M} ${p}`).replace(/"/g, '\\"');
    const desc = (op.description || op.summary || "HTTP API").replace(/"/g, '\\"');
    const openapiLine = `${M} ${p}`.replace(/\s+/g, " ");

    const mdx = `---
title: "${title}"
description: "${desc}"
openapi: "${openapiLine}"
---
`;
    fs.mkdirSync(path.dirname(fpath), { recursive: true });
    fs.writeFileSync(fpath, mdx, "utf8");
    pages.push({ group: folder, page: relp.replace(/\.mdx$/, ""), M, p, title: op.summary });
  }
}

const whMdx = `---
title: "Partner inbound webhook"
description: "JSON POST from Dancity to your configured HTTPS URL"
---

See [Webhooks — verify & payload](/guides/webhook) for setup and security.

\`event\` / \`data\` fields are described in the OpenAPI \`webhooks.partnerTransaction\` entry (same \`openapi.json\`).
`;
const whDir = path.join(__dirname, "../api-reference/webhooks");
fs.mkdirSync(whDir, { recursive: true });
fs.writeFileSync(path.join(whDir, "partner-inbound.mdx"), whMdx, "utf8");

// Output suggested group order
const order = [
  "external-v1",
  "catalog",
  "wallet",
  "transactions",
  "betting",
  "education",
  "esim",
  "virtual-card",
  "webhooks",
];

const groupLabels = {
  "external-v1": "VAS",
  catalog: "Products & services",
  wallet: "Wallet",
  transactions: "Transactions",
  betting: "Betting",
  education: "Education",
  esim: "eSIM",
  "virtual-card": "Virtual card",
  webhooks: "Webhook",
  misc: "Other",
};

const byG = {};
for (const x of pages) {
  if (!byG[x.group]) byG[x.group] = [];
  byG[x.group].push(x.page);
}
for (const g of order) {
  if (byG[g]) byG[g].sort();
}

const groups = order
  .filter((g) => byG[g])
  .map((g) => ({
    group: groupLabels[g] || g,
    pages: byG[g],
  }));
groups.push({
  group: "Webhooks (partner)",
  pages: ["api-reference/webhooks/partner-inbound"],
});

const out = {
  groups: [
    { group: "Getting started", pages: ["api-reference/introduction"] },
    ...groups,
  ],
};
fs.writeFileSync(
  path.join(__dirname, "generated-api-nav.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);
console.log("Wrote", pages.length, "MDX + generated-api-nav.json");
