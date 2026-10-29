import type * as IAP from 'expo-iap';
import { BILLING_ON, UNLOCK_SKU } from './unlock';
import { updateUnlock } from './unlockState';

// Store billing for the one unlock: Google Play Billing and StoreKit 2,
// straight from the phone through expo-iap. No RevenueCat, no server of ours,
// no account: the store keeps the receipt and the phone asks it. That keeps
// the "Data not collected" label true.
//
// Off until the store launch (BILLING_ON in unlock.ts). While it is off the
// native module is never loaded, so test builds behave exactly as before.

let iap: typeof IAP | null = null;
let started = false;
let onError: ((message: string) => void) | null = null;

function lib(): typeof IAP | null {
  if (!BILLING_ON) return null;
  if (!iap) iap = require('expo-iap') as typeof IAP;
  return iap;
}

const owns = (purchases: Array<{ productId: string; purchaseState: string }>) => purchases.some((p) => p.productId === UNLOCK_SKU && p.purchaseState === 'purchased');

/** Connect once at start, listen for purchases, and confirm with the store what this phone owns. */
export async function startBilling(): Promise<void> {
  const m = lib();
  if (!m || started) return;
  started = true;
  try {
    await m.initConnection();
    m.purchaseUpdatedListener(async (purchase) => {
      if (purchase.productId !== UNLOCK_SKU || purchase.purchaseState !== 'purchased') return;
      // Acknowledge it, or Google refunds it after three days.
      await m.finishTransaction({ purchase, isConsumable: false }).catch(() => {});
      updateUnlock({ owned: true });
    });
    m.purchaseErrorListener((e) => {
      if (m.isUserCancelledError(e)) return;
      onError?.(m.getUserFriendlyErrorMessage(e));
    });
    await syncOwned();
  } catch {
    // No store on this phone, or offline: the saved state stands.
  }
}

/** Ask the store what's owned. A refund turns the unlock back off; no answer changes nothing. */
async function syncOwned(): Promise<boolean | null> {
  const m = lib();
  if (!m) return null;
  try {
    const owned = owns(await m.getAvailablePurchases());
    updateUnlock({ owned });
    return owned;
  } catch {
    return null;
  }
}

/** The price in the shopper's own currency, as the store shows it. Null while billing is off. */
export async function storePrice(): Promise<string | null> {
  const m = lib();
  if (!m) return null;
  try {
    const products = await m.fetchProducts({ skus: [UNLOCK_SKU], type: 'in-app' });
    const p = (products as Array<{ id: string; displayPrice: string }> | null)?.find((x) => x.id === UNLOCK_SKU);
    return p?.displayPrice ?? null;
  } catch {
    return null;
  }
}

export type BuyResult = { kind: 'started' } | { kind: 'off' } | { kind: 'error'; message: string };

/** Open the store's own payment sheet. The outcome arrives through the purchase listener. */
export async function buyUnlock(errors?: (message: string) => void): Promise<BuyResult> {
  const m = lib();
  if (!m) return { kind: 'off' };
  onError = errors ?? null;
  try {
    await startBilling();
    await m.requestPurchase({ request: { apple: { sku: UNLOCK_SKU }, google: { skus: [UNLOCK_SKU] } }, type: 'in-app' });
    return { kind: 'started' };
  } catch (e) {
    if (m.isUserCancelledError(e)) return { kind: 'started' };
    return { kind: 'error', message: m.getUserFriendlyErrorMessage(e as never) };
  }
}

/** For a new phone, or after reinstalling: the store remembers, we don't need to. */
export async function restoreUnlock(): Promise<boolean | null> {
  const m = lib();
  if (!m) return null;
  try {
    await startBilling();
    await m.restorePurchases();
  } catch {
    // fall through to asking what's owned
  }
  return syncOwned();
}
