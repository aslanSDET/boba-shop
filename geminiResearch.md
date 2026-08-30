Here is the complete, comprehensive technical specification and architectural blueprint document. You can save this directly as `HEADLESS_CLOVER_ORDERING_SPEC.md` for your AI coding agent (Claude Code, Cursor, or Windsurf) to ingest and execute.

---

```markdown
# Headless Clover Web Ordering Platform: Architecture & Technical Specification

**Target Application:** High-conversion, mobile-first Progressive Web App (PWA) for customizable boba, shaved snow, and specialty fast-casual dessert menus.
**Production Targets:** Multi-location rollout (Snowdaes Lowell & Billerica), expandable to a multi-tenant productized SaaS / agency offering for mom-and-pop restaurants.
**Design Benchmarks:** 
- **Aesthetic:** The Alley (`the-alley.us`) — Premium dark editorial theme (`#0D0D11`), high contrast, gold/amber accents, high-res photography.
- **UX & Flow:** Kung Fu Tea (`kft.orderexperience.net`) — Sticky category scroll tabs, mobile bottom-sheet modifier drawers (Size, Sugar %, Ice %, multi-select Toppings with price deltas).

---

## Table of Contents
1. [Executive Summary & Strategic Context](#1-executive-summary--strategic-context)
2. [Market Analysis & Competitive Landscape](#2-market-analysis--competitive-landscape)
3. [System Architecture & Data Flow](#3-system-architecture--data-flow)
4. [Clover Payment, Security & PCI Compliance Architecture](#4-clover-payment-security--pci-compliance-architecture)
5. [Multi-Location Configuration (Lowell & Billerica)](#5-multi-location-configuration-lowell--billerica)
6. [Inventory Sync & DynamoDB Cache Strategy](#6-inventory-sync--dynamodb-cache-strategy)
7. [Order Placement Engine (Atomic Orders, Taxes, Discounts, Tips, Gift Cards)](#7-order-placement-engine)
8. [Production Code Blueprints & Schemas](#8-production-code-blueprints--schemas)
9. [Step-by-Step Agent Implementation Plan](#9-step-by-step-agent-implementation-plan)

---

## 1. Executive Summary & Strategic Context

Modern food chains (Starbucks, Sweetgreen, Chipotle) never send online customers to their POS vendor’s generic checkout. They utilize a **Headless POS Architecture**: a custom Next.js/React frontend providing sub-second page loads and specialized customization flows, connected via serverless middleware to standard in-store POS hardware.

This project implements that exact enterprise architecture for Clover POS:
* **The Problem:** Default Clover Online storefronts (`cloveronline.com`) and legacy plugins look dated, load slowly, and handle deep boba/dessert modifier trees poorly.
* **The Solution:** A decoupled Next.js 14 PWA hosted on AWS (CloudFront/S3 or Amplify) reading from an ultra-low-latency Amazon DynamoDB menu cache (<15ms) and writing orders directly to Clover's cloud APIs (`atomic_order`).
* **In-Store Impact:** Zero friction for kitchen staff. Orders automatically inject into the merchant's physical Clover Station and auto-print to existing kitchen/bar thermal printers with full modifier layouts.

---

## 2. Market Analysis & Competitive Landscape

### 2.1 The Incumbents

| Competitor | Pricing Model | Strengths | Critical Weaknesses |
| :--- | :--- | :--- | :--- |
| **Smart Online Order (by Zaytech)** | $30–$80/mo | Native Clover App Market plugin; direct sync. | Outdated 2010s WordPress interface; clunky mobile UX; frequent sync lag. |
| **BentoBox (Fiserv/Clover)** | $150–$350+/mo | Official Clover integration; polished traditional restaurant layouts. | Rigid templates; poor modifier UX for boba/desserts; expensive for single-store margins. |
| **Popmenu** | $179–$499/mo + $1/order | Photo-driven menus; direct Clover Iframe integration (`checkout.clover.com/sdk.js`). | Order fees compound quickly; cookie-cutter checkout flow. |
| **Owner.com / ChowNow** | $250–$499/mo | Automated marketing; native white-label apps. | Prohibitively expensive; aggressive lock-in contracts; generic UI. |

### 2.2 Key Learnings from Agency & Solo Dev Deployments
* **Pricing Model:** Never sell restaurant sites for a flat one-time fee (avoids lifetime unpaid maintenance). Structure as either **Franchise Equity / Fee Reduction** or a **Productized Retainer ($1,500 setup + $79–$149/mo)** covering hosting, menu updates, and infrastructure.
* **The Kitchen Printer is Non-Negotiable:** If staff must check a tablet dashboard instead of hearing the thermal printer beep, orders get missed. Direct Clover API dispatch solves this natively.
* **Handling Mid-Day 86s:** A daily menu sync is insufficient on its own. Store inventory needs a webhook or manual sync trigger to handle mid-day stock depletion (e.g., running out of brown sugar boba on a Saturday rush).

---

## 3. System Architecture & Data Flow


```

┌────────────────────────────────────────────────────────────────────────┐
│ NEXT.JS 14 PWA (Frontend on Vercel / CloudFront + S3)                   │
│                                                                        │
│ • Dark Mode UI (#0D0D11) + Gold Highlights                             │
│ • Bottom-Sheet Modifier Drawers (Zustand Cart State)                   │
│ • Clover Hosted Iframe SDK (Renders Card Input inside sandboxed iframe) │
└───────────────┬────────────────────────────────────────┬───────────────┘
│ 1. Read Menu (<15ms)                   │ 2. Submit Token & Order
▼                                        ▼
┌────────────────────────────────┐       ┌───────────────────────────────┐
│ AMAZON DYNAMODB                │       │ AWS API GATEWAY + LAMBDA      │
│ (Single-Table Menu Cache)      │       │ (Node.js / TypeScript)        │
└────────────────────────────────┘       └───────────────┬───────────────┘
│
│ 3. Fetch Private Secrets
▼
┌───────────────────────────────┐
│ AWS SECRETS MANAGER           │
│ (Merchant Private API Tokens) │
└───────────────┬───────────────┘
│
│ 4. HTTPS REST API
▼
┌───────────────────────────────┐
│ CLOVER CLOUD ENGINE           │
│ • Token Charge (/v1/charges)  │
│ • /v3/.../atomic_order/orders │
└───────────────┬───────────────┘
│
│ 5. LAN / Cloud Auto-Print
▼
┌───────────────────────────────┐
│ IN-STORE CLOVER HARDWARE      │
│ • Clover Station 2018 / Solo  │
│ • Thermal Kitchen Printer     │
└───────────────────────────────┘

```

---

## 4. Clover Payment, Security & PCI Compliance Architecture

### 4.1 Payment Options Comparison

| Integration Method | Endpoint / SDK | PCI Compliance Scope | Flexibility | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Clover Hosted Redirect** | `POST /invoicingcheckoutservice/v1/checkouts` | **SAQ A** (Zero card data) | Low. Redirects to external invoice page; drops modifier layout & auto-tax calculation. | **Avoid for Restaurants** |
| **Direct Card API** | Raw PAN submission via REST | **SAQ D** (High liability, massive audit burden) | High. | **Strictly Forbidden** |
| **Clover Hosted Fields (Iframe SDK)** | `https://checkout.clover.com/sdk.js` + `POST /atomic_order` | **SAQ A** (Clover-hosted iframe handles PAN; app only handles `clv_xxx` token) | **Maximum.** Total UI control on Next.js, auto-tax, kitchen auto-print. | **Recommended Standard** |

### 4.2 Security & TransArmor Tokenization
* **Zero Liability:** Keystrokes for Card Number, Exp Date, and CVV are isolated within Clover’s cross-origin iframe hosted on `checkout.clover.com`. Keystrokes cannot be intercepted by client scripts.
* **TransArmor Engine:** Clover tokenizes the payment details directly on Fiserv's servers, returning a one-time token (`clv_18a7d...`) valid for ~15 minutes.
* **Paze Wallet:** Note that the "paze" button on default Clover pages is an online bank wallet by Early Warning Services (Chase, BofA, Wells Fargo). Embedding Clover’s Iframe SDK handles credit cards and native Apple Pay / Google Pay out of the box.

### 4.3 Audited Real-World Proof of Clover Iframe Usage
* **Locals Only (Rochester, NY):** `localsonly311.com/menu` — Uses Popmenu to mount Clover's secure iframe from `https://checkout.clover.com/sdk.js` to process payments directly into in-store Clover POS hardware.
* **WeeConnectPay:** Direct Clover-to-WooCommerce gateway utilizing the same `scl.clover.com` iframe tokenization layer.

---

## 5. Multi-Location Configuration (Lowell & Billerica)

Do **not** create separate codebases. Use a unified Next.js application with dynamic route segments (`/[location]/menu`) and a backend store-mapping configuration.

### 5.1 Store Configuration Registry

```typescript
// src/config/stores.ts
export interface StoreLocation {
  slug: string;
  name: string;
  cloverMerchantId: string;
  pakmsPublicKey: string; // Public key for Clover Iframe SDK
  secretKeyName: string;  // AWS Secrets Manager path for Private Bearer Token
  address: string;
  phone: string;
  taxRateEstimate: number; // For client display only; Clover computes exact tax
}

export const STORE_LOCATIONS: Record<string, StoreLocation> = {
  lowell: {
    slug: 'lowell',
    name: 'Snowdaes - Lowell',
    cloverMerchantId: 'MERCHANT_ID_LOWELL_PLACEHOLDER',
    pakmsPublicKey: 'PAKMS_PUBLIC_KEY_LOWELL',
    secretKeyName: 'production/clover/lowell/api_token',
    address: '1075 Westford Street, STE 107, Lowell, MA 01851',
    phone: '(978) 555-0100',
    taxRateEstimate: 0.07, // 6.25% MA State + 0.75% Lowell meals tax
  },
  billerica: {
    slug: 'billerica',
    name: 'Snowdaes - Billerica',
    cloverMerchantId: 'MERCHANT_ID_BILLERICA_PLACEHOLDER',
    pakmsPublicKey: 'PAKMS_PUBLIC_KEY_BILLERICA',
    secretKeyName: 'production/clover/billerica/api_token',
    address: 'Billerica, MA',
    phone: '(978) 555-0200',
    taxRateEstimate: 0.07,
  },
};

```

---

## 6. Inventory Sync & DynamoDB Cache Strategy

### 6.1 DynamoDB Single-Table Schema (`Snowdaes_POS_Cache`)

| Partition Key (`PK`) | Sort Key (`SK`) | Attributes / Payload Data |
| --- | --- | --- |
| `MERCHANT#<mId>` | `MENU#CURRENT` | `categories[]`, `items[]`, `modifierGroups{}`, `lastSyncedAt` |
| `MERCHANT#<mId>` | `ORDER#<orderId>` | `cloverOrderId`, `customerEmail`, `totalAmount`, `status`, `createdAt` |

### 6.2 Sync Pipeline (Hybrid 3-Tier Strategy)

1. **Scheduled Cron (AWS EventBridge):** Runs daily at 3:00 AM, triggering the Sync Lambda to pull `GET /v3/merchants/{mId}/items?expand=modifierGroups.modifiers,categories,tags` and overwrite `MENU#CURRENT`.
2. **Real-Time Clover Webhook:** Subscribes to Clover inventory event keys (`I` for Items, `IM` for Modifiers, `IG` for Groups) to instantly mark 86'd items as `isAvailable: false`.
3. **Manual Sync Endpoint (`POST /api/sync`):** Admin-authenticated route enabling the store manager to force an immediate refresh when updating POS items mid-day.

---

## 7. Order Placement Engine

### 7.1 Matching IDs & Surcharges

* **Item & Modifier IDs:** Every item and modifier passed to Clover **must** include its native Clover `id` string (e.g., `item: { id: "ITEM_123" }`, `modifications: [{ modifier: { id: "MOD_456" } }]`). This ensures the kitchen printer routes tickets to the correct stations (e.g., boba bar vs. shaved ice prep).
* **Currency Formatting:** All monetary values sent to Clover must be integers in **cents** ($8.50 = `850`).

### 7.2 Sales Tax Calculation

* **Server-Side Automatic Execution:** Never hardcode tax calculations for the final charge. When the Lambda submits the `atomic_order` payload containing valid Clover `item.id` values, Clover calculates state (6.25%) and local meals tax (0.75%) automatically on its servers.

### 7.3 Custom Discount Codes

* Discounts are validated by your backend and passed into the `atomic_order` payload via the `discounts[]` array:
```json
"discounts": [
  {
    "name": "PROMO: 10OFF",
    "amount": -150
  }
]

```


Clover subtracts $1.50 from the subtotal and prints `"Promo: 10OFF (-$1.50)"` directly on the physical receipt.

### 7.4 Tips & Payment Execution

1. **Create Order:** `POST /v3/merchants/{mId}/atomic_order/orders` $\rightarrow$ returns created `orderId` and computed tax total.
2. **Execute Charge & Tip:** `POST /v1/orders/{orderId}/pay` passing:
* `source`: The `clv_token` received from the frontend iframe.
* `amount`: Grand total in cents (Subtotal + Tax - Discounts + Tip).
* `tip_amount`: Tip value in cents (properly allocated to the employee shift tip pool on the physical POS).



### 7.5 Customer Profile Linking

* Pass `customer: { firstName, lastName, email, phoneNumber }` in the `atomic_order`. Clover automatically links the order to existing CRM profiles or creates a new entry in the merchant's customer list.

---

## 8. Production Code Blueprints & Schemas

### 8.1 Frontend: Clover Iframe Payment Component (Next.js 14)

```tsx
// src/components/checkout/CloverPaymentForm.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    Clover: any;
  }
}

interface CloverPaymentFormProps {
  pakmsPublicKey: string;
  merchantId: string;
  onTokenCreated: (token: string) => void;
  onError: (errorMessage: string) => void;
  isProcessing: boolean;
}

export const CloverPaymentForm: React.FC<CloverPaymentFormProps> = ({
  pakmsPublicKey,
  merchantId,
  onTokenCreated,
  onError,
  isProcessing,
}) => {
  const [cloverInstance, setCloverInstance] = useState<any>(null);
  const elementsRef = useRef<any>(null);

  useEffect(() => {
    // 1. Dynamically load Clover SDK script
    const script = document.createElement('script');
    script.src = '[https://checkout.clover.com/sdk.js](https://checkout.clover.com/sdk.js)';
    script.async = true;
    script.onload = () => {
      if (window.Clover) {
        // 2. Initialize Clover client
        const clover = new window.Clover(pakmsPublicKey, {
          merchantId: merchantId,
        });
        setCloverInstance(clover);

        // 3. Custom dark mode styling matching The Alley aesthetic
        const styles = {
          'input': {
            'font-family': 'Inter, sans-serif',
            'font-size': '15px',
            'color': '#F8FAFC',
            '::placeholder': { 'color': '#64748B' },
          },
        };

        const elements = clover.elements();
        const cardNumber = elements.create('CARD_NUMBER', styles);
        const cardDate = elements.create('CARD_DATE', styles);
        const cardCvv = elements.create('CARD_CVV', styles);
        const cardPostalCode = elements.create('CARD_POSTAL_CODE', styles);

        cardNumber.mount('#card-number-container');
        cardDate.mount('#card-date-container');
        cardCvv.mount('#card-cvv-container');
        cardPostalCode.mount('#card-postal-container');

        elementsRef.current = { cardNumber, cardDate, cardCvv, cardPostalCode };
      }
    };
    script.onerror = () => onError('Failed to load secure payment gateway.');
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [pakmsPublicKey, merchantId]);

  const handleTokenize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloverInstance) return;

    try {
      // 4. Request TransArmor card token from Clover Iframe
      const result = await cloverInstance.createToken();
      if (result.errors) {
        const firstErrorKey = Object.keys(result.errors)[0];
        onError(result.errors[firstErrorKey]);
      } else if (result.token) {
        onTokenCreated(result.token);
      }
    } catch (err: any) {
      onError(err.message || 'Payment tokenization error');
    }
  };

  return (
    <form id="payment-form" onSubmit={handleTokenize} className="space-y-4 text-white">
      <div className="bg-[#16161F] p-4 rounded-xl border border-white/10 space-y-3">
        <div>
          <label className="text-xs uppercase text-zinc-400 tracking-wider">Card Number</label>
          <div id="card-number-container" className="h-11 px-3 mt-1 bg-[#0D0D11] border border-white/10 rounded-lg flex items-center" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs uppercase text-zinc-400 tracking-wider">Exp Date</label>
            <div id="card-date-container" className="h-11 px-3 mt-1 bg-[#0D0D11] border border-white/10 rounded-lg flex items-center" />
          </div>
          <div>
            <label className="text-xs uppercase text-zinc-400 tracking-wider">CVV</label>
            <div id="card-cvv-container" className="h-11 px-3 mt-1 bg-[#0D0D11] border border-white/10 rounded-lg flex items-center" />
          </div>
          <div>
            <label className="text-xs uppercase text-zinc-400 tracking-wider">Zip Code</label>
            <div id="card-postal-container" className="h-11 px-3 mt-1 bg-[#0D0D11] border border-white/10 rounded-lg flex items-center" />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isProcessing}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition duration-200 disabled:opacity-50"
      >
        {isProcessing ? 'Processing Secure Order...' : 'Place Pickup Order'}
      </button>
    </form>
  );
};

```

---

### 8.2 Backend: Order Processing Lambda (TypeScript)

```typescript
// backend/src/handlers/processOrder.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { STORE_LOCATIONS } from '../config/stores';
import axios from 'axios';

const secretsClient = new SecretsManagerClient({});

interface OrderRequestBody {
  locationSlug: 'lowell' | 'billerica';
  clvToken: string;
  tipAmountCents: number;
  promoCode?: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  cartItems: Array<{
    cloverItemId: string;
    quantity: number;
    modifierIds: string[];
    priceCents: number;
  }>;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body: OrderRequestBody = JSON.parse(event.body || '{}');
    const store = STORE_LOCATIONS[body.locationSlug];
    if (!store) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid location specified' }) };
    }

    // 1. Retrieve merchant private token from AWS Secrets Manager
    const secretData = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: store.secretKeyName })
    );
    const cloverPrivateToken = secretData.SecretString;

    const cloverHeaders = {
      Authorization: `Bearer ${cloverPrivateToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // 2. Format Line Items and Nested Modifiers
    const lineItems = body.cartItems.flatMap((item) => {
      const itemsArray = [];
      for (let i = 0; i < item.quantity; i++) {
        itemsArray.push({
          item: { id: item.cloverItemId },
          price: item.priceCents,
          modifications: item.modifierIds.map((modId) => ({
            modifier: { id: modId },
          })),
        });
      }
      return itemsArray;
    });

    // 3. Prepare Atomic Order Payload
    const atomicPayload: any = {
      orderCart: {
        title: `Online Order - ${body.customer.firstName} ${body.customer.lastName}`,
        lineItems: lineItems,
        customer: {
          firstName: body.customer.firstName,
          lastName: body.customer.lastName,
          email: body.customer.email,
          phoneNumber: body.customer.phone,
        },
      },
    };

    // 4. Inject Discount if applicable
    if (body.promoCode === 'WELCOME10') {
      atomicPayload.orderCart.discounts = [
        {
          name: 'Promo: WELCOME10',
          amount: -150, // -$1.50
        },
      ];
    }

    // 5. Submit Atomic Order (Calculates exact meals tax & links kitchen printing)
    const atomicOrderUrl = `[https://api.clover.com/v3/merchants/$](https://api.clover.com/v3/merchants/$){store.cloverMerchantId}/atomic_order/orders`;
    const orderResponse = await axios.post(atomicOrderUrl, atomicPayload, { headers: cloverHeaders });
    const cloverOrder = orderResponse.data;
    const orderId = cloverOrder.id;
    const computedTotal = cloverOrder.total; // Total includes Subtotal + Clover-calculated Tax - Discounts

    // 6. Charge Card Token & Apply Tip via Clover Ecommerce Pay API
    const grandTotalCents = computedTotal + body.tipAmountCents;
    const payUrl = `[https://api.clover.com/v1/orders/$](https://api.clover.com/v1/orders/$){orderId}/pay`;

    const paymentResponse = await axios.post(
      payUrl,
      {
        orderId: orderId,
        source: body.clvToken,
        amount: grandTotalCents,
        tip_amount: body.tipAmountCents,
        currency: 'usd',
      },
      { headers: cloverHeaders }
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        orderId: orderId,
        chargeId: paymentResponse.data.id,
        receiptUrl: paymentResponse.data.receipt_url,
        totalCharged: grandTotalCents,
      }),
    };
  } catch (error: any) {
    const errorDetails = error.response?.data || error.message;
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Order placement failed', details: errorDetails }),
    };
  }
};

```

---

## 9. Step-by-Step Agent Implementation Plan

Instruct your coding agent to execute tasks in the following sequential order:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CONFIG & TYPES: Define stores.ts & Clover API typings    │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. DYNAMODB SYNC LAMBDA: Build /sync menu ingest pipeline   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. FRONTEND CATALOG & DRAWER: Next.js + Tailwind modifiers  │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CLOVER IFRAME COMPONENT: Mount SDK & handle tokenization │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. BACKEND CHECKOUT LAMBDA: atomic_order + pay endpoints    │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. E2E VERIFICATION: Test in sandbox with thermal receipt   │
└─────────────────────────────────────────────────────────────┘

```

1. **Step 1 — Environment & Configuration Registry:** Create `src/config/stores.ts` with multi-tenant configurations for Lowell and Billerica.
2. **Step 2 — Inventory Ingest Lambda:** Build the Lambda function to fetch Clover categories, items, and modifier groups and write denormalized documents to DynamoDB.
3. **Step 3 — UI & Modifier Drawer Component:** Implement the Next.js 14 menu views, category anchor pills, and bottom-sheet modifier drawers with real-time price delta calculation.
4. **Step 4 — Clover Iframe Integration:** Embed `checkout.clover.com/sdk.js` in a React payment component to capture `clv_token` without handling raw credit card data.
5. **Step 5 — Atomic Order & Payment Backend:** Deploy the AWS API Gateway and Lambda handler executing `POST /v3/merchants/{mId}/atomic_order/orders` followed by `POST /v1/orders/{orderId}/pay`.
6. **Step 6 — Confirmation & Receipt Display:** Build the `/order/[id]` post-purchase screen rendering pickup time estimations and order confirmation metadata.

```

```