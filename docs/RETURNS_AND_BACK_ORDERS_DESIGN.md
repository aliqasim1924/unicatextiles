# Finished Fabric Returns/Exchanges & Back Orders – Design Suggestions

This document outlines recommended approaches for:
1. **Finished fabric returns and exchanges** from customers (with optional Pastel credit note recording and exchange slips).
2. **Partial order fulfillment and back orders** (auto-create a back order when a partial dispatch is done).

---

## 1. Finished Fabric Returns & Exchanges

### Business flows

- **Return with credit/refund**: Customer returns fabric; company issues a credit note in Pastel. You need to record the return in the app and optionally link the **Pastel credit note number**.
- **Return with exchange**: Customer returns fabric and receives replacement fabric. You need a concrete **exchange slip** (source document) that records both the return and the re-issue.
- **Return reason**: Not required, fault, wrong colour, no longer needed, etc. – useful for reporting and for exchange vs credit decision.

### Recommended data model

#### Option A (recommended): Single “returns” table + link to credit or exchange

- **`customer_returns`** (or `finished_fabric_returns`)
  - `id`, `created_at`, `returned_by` (user)
  - `customer_id` (who returned)
  - `original_issue_id` (FK to `finished_fabric_store_issues` – the dispatch that sent the fabric out)
  - `original_order_id` (FK to `customer_orders` – optional, for reporting)
  - `disposition`: `CREDIT` | `EXCHANGE` | `REFUND`
  - `pastel_credit_note_no` (nullable – only when disposition is CREDIT/REFUND and Pastel CN is raised)
  - `reason` or `return_reason_id` (e.g. Fault, Wrong colour, Not required, Other)
  - `notes`
  - `exchange_slip_no` (nullable – set when disposition is EXCHANGE and an exchange slip is created; could be a sequence like FEX-000001)

- **`customer_return_lines`** (or `finished_fabric_return_items`)
  - `return_id`, `roll_id` (the roll being returned – from the original issue)
  - `length_m`, `grade` (as returned; can differ if cut)
  - `notes`

**Behaviour:**

- **Credit/refund**: Create a `customer_returns` row with disposition `CREDIT` (or `REFUND`), attach return lines (which rolls were returned). When Pastel credit note is raised, store `pastel_credit_note_no`. Rolls can either:
  - stay in DISPATCHED/ISSUED with a “returned” flag or status, or
  - be moved to a “RETURNED” status and optionally a virtual location (e.g. `RETURNED_PENDING_INSPECTION`) so they don’t show as “at customer” and can later be brought back to store or scrapped.
- **Exchange**: Create a `customer_returns` row with disposition `EXCHANGE`, attach return lines (rolls coming back). Generate an **exchange slip number** (e.g. FEX-000001) and store it on the return. Then create a **new store issue** (or a dedicated “exchange issue”) that issues the replacement rolls to the same customer; link that issue to the return (e.g. `exchange_issue_id` on `customer_returns`). The exchange slip can be a printable document that shows:
  - Return: customer name, original issue ref, rolls returned (roll no, length, grade), reason.
  - Exchange: rolls issued out (roll no, length, grade).
  - So you have one source document for the full exchange.

**Simpler variant (no new tables for “issue” side of exchange):**  
Keep `customer_returns` + `customer_return_lines` as above. For exchange, after recording the return (with `exchange_slip_no`), use the **existing “Issue from Finished Store”** flow to issue the replacement rolls to the customer and in the reference/notes refer to the exchange slip number. No need for a separate “exchange issue” table; the return record + existing issue record together form the audit trail.

### UI suggestions

- **Menu**: Under Orders & Dispatch or Finished Fabric Store, add e.g. **“Customer returns”** or **“Returns & exchanges”**.
- **Create return**:
  - Select customer (and optionally original order or original issue).
  - Select disposition: Credit / Exchange / Refund.
  - If Credit/Refund: field for **Pastel credit note number** (optional at save; can edit later when CN is raised).
  - Return reason (dropdown + optional free text).
  - Add return lines: either select rolls that were previously issued (from `finished_fabric_store_issue_items` / rolls with status ISSUED and location DISPATCHED for that customer), or enter roll numbers/lengths manually if you don’t track by roll.
  - Notes.
- **Exchange**: Same as above; after saving the return with disposition Exchange, show “Create exchange issue” that deep-links to Issue from Store with customer/order pre-filled and reference set to the exchange slip number, or a short wizard: “Select replacement rolls” → creates the store issue and links it to the return.
- **Exchange slip print**: A dedicated print view for a return with disposition Exchange (and optionally linked issue), showing return details + replacement issue details as one document.
- **List view**: List returns by date; filter by customer, disposition, credit note no; show whether Pastel CN is recorded.

### Roll state when returned

- **Option 1**: New status e.g. `RETURNED` and location `RETURNED` (or `PENDING_INSPECTION`). Later, a separate “Receive returned fabric” step can move inspected/approved rolls back to `IN_STORE` and `IN_STORE` (or grade-adjusted). Rejected rolls can stay RETURNED or be written off.
- **Option 2**: Directly move returned rolls back to `IN_STORE` and status `IN_STORE` when the return is recorded, if you don’t need an inspection step in the app.

Recommendation: Option 1 if you physically receive and inspect returns; Option 2 if you want to keep the model minimal and inspection is offline.

---

## 2. Partial Fulfillment & Back Orders

### Requirement

- When a customer order is **partially** fulfilled (only part of the ordered quantity is dispatched), the shortfall must be tracked.
- **Automatically create a Back Order** for that customer for the remaining quantity (same line specs: colour, coating, GSM, width, etc.).

### Current behaviour (brief)

- `customer_orders` has status OPEN | PARTIALLY_FULFILLED | COMPLETED | CANCELLED.
- `customer_order_lines` has `quantity_m` (ordered).
- Fulfillment is computed at runtime from `finished_fabric_store_issues` + `finished_fabric_store_issue_items` (by matching roll specs to order lines). There is no `fulfilled_m` or `issued_m` stored per line.
- When you issue to a customer, order is set to PARTIALLY_FULFILLED (and can later be set to COMPLETED manually or when fully fulfilled).

### Recommended approach: Back order as a new order linked to the original

- **Option A – Back order as a normal order with a link**
  - Add on `customer_orders`: `parent_order_id` (nullable FK to `customer_orders`) and/or `is_back_order` (boolean).
  - When a **partial** store issue is completed for an order:
    1. Compute remaining quantity per “line” (same matching logic you use today: by fabric_type_id, color_option_id, gsm_option_id, width_option_id / coating_type, color, gsm).
    2. For each (logical) line where remaining &gt; 0, create a **new** `customer_orders` row (the “back order”) with:
       - `customer_id` = same as original order
       - `parent_order_id` = original order id
       - `is_back_order` = true
       - `order_ref` = e.g. “BO-” + original order_ref + “-1” (or a new sequence)
       - `status` = OPEN
    3. Create `customer_order_lines` for the back order with the **remaining** quantities (and same fabric_type_id, color_option_id, gsm_option_id, width_option_id, coating_type, color, gsm).
  - Original order stays PARTIALLY_FULFILLED (or you can add a rule to set it to COMPLETED when the **issued** quantity equals ordered and back order holds the rest – see below).
  - Fulfillment of the back order is done via the same “Issue from Store” flow; when fully fulfilled, mark back order COMPLETED.

- **Option B – Store fulfilled quantities per line**
  - Add to `customer_order_lines`: `fulfilled_m` (default 0), updated whenever you issue against that order (you’d need to allocate issue items to order lines, which is more complex).
  - When issuing, update `fulfilled_m` for the relevant line(s). When `fulfilled_m` &lt; `quantity_m` after an issue, create a back order with that line’s shortfall.
  - This gives an explicit “per-line fulfilled” state but requires allocation logic (which rolls map to which order line).

**Recommendation:** Option A. Reuse your existing “remaining = ordered_m − issued_m (from issues)” logic to compute shortfalls at the moment you complete a partial issue; then create one back order per partial fulfillment with lines for each logical shortfall. No need for `fulfilled_m` on lines unless you later want to show “fulfilled per line” on the original order without recomputing.

### When to create the back order

- **At issue save time**: When the user completes an “Issue from Store” for destination CUSTOMER and the selected quantities leave a **remaining &gt; 0** for at least one “line” (color/coating/GSM/width combo), immediately:
  1. Create the back order (one per partial fulfillment, or one per order that was just partially fulfilled).
  2. Create back order lines with remaining quantities.
  3. Optionally set original order to COMPLETED if you define “completed” as “all originally ordered quantity is either issued or moved to back order” (so the original order is closed and the back order carries the open balance).

- **UI**: After “Store issue created” success, you can show a message: “Back order BO-ORD-001-1 created for remaining 500 m.” with a link to the back order.

### Edge cases

- **Multiple partial dispatches**: If the same order is partially fulfilled again before the first back order is fulfilled, you have two options:
  - (a) Create a new back order each time (multiple back orders per original order), or
  - (b) Find an existing open back order for that `parent_order_id` and add/update lines with the new shortfall (single back order per original).
- Recommendation: (b) is simpler for the user – one back order per original order, updated when they do another partial issue. When creating a back order, check for existing OPEN back order with same `parent_order_id`; if found, add or update lines for the new shortfalls (and optionally merge duplicate line specs by adding quantities).

### Summary for back orders

- Add `parent_order_id` (nullable) and `is_back_order` (boolean) to `customer_orders`.
- On “Issue from Store” (CUSTOMER) submit: compute remaining per logical line; if any remaining &gt; 0, create or update a back order (one per original order) with lines for the shortfall; optionally mark original COMPLETED when everything is either issued or on the back order.
- Orders list / customer activity: show back orders and link to parent order so it’s clear what is back order vs original.

---

## 3. Implementation order suggestion

1. **Back orders** (smaller scope, reuses existing issue flow):  
   Add `parent_order_id` and `is_back_order`, then after a partial CUSTOMER issue create/update back order and lines. No new screens; only list/filter for “Back orders” and display of parent/child on order detail.
2. **Returns (credit only)** (minimal):  
   Add `customer_returns` + `customer_return_lines`, disposition CREDIT/REFUND, Pastel credit note number, return reason. No roll state change initially if you prefer; or add RETURNED status and move rolls there.
3. **Returns (exchange)** (source document):  
   Add disposition EXCHANGE, exchange slip number, and “Exchange slip” print view; optionally link to the new store issue created for the replacement rolls.
4. **Roll lifecycle for returns**:  
   Introduce RETURNED status/location and, if needed, “Receive returned fabric” to move rolls back to store after inspection.

This gives you a clear path from “track partials and back orders” to “record returns and credit notes” to “exchange slip and full return lifecycle” without changing existing behaviour more than necessary.
