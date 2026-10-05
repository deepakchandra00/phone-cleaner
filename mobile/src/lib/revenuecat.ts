import { Platform } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";
import { REVENUECAT_ANDROID_KEY } from "@env";
import type { Entitlement } from "@/stores/usePremiumStore";

const ENTITLEMENT_PRODUCT = {
  yearly: {
    id: "phone_cleaner_pro_yearly",
    price: "$9.99",
    pricePerMonth: "$0.83",
    period: "per year",
    savings: "Save 58%",
  },
  monthly: {
    id: "phone_cleaner_pro_monthly",
    price: "$1.99",
    pricePerMonth: "$1.99",
    period: "per month",
    savings: "",
  },
};

export const PLANS = ENTITLEMENT_PRODUCT;

export function isRevenueCatConfigured(): boolean {
  return (
    !!REVENUECAT_ANDROID_KEY &&
    REVENUECAT_ANDROID_KEY.length > 10 &&
    !REVENUECAT_ANDROID_KEY.includes("xxxx")
  );
}

export async function initRevenueCat(): Promise<void> {
  if (!isRevenueCatConfigured() || Platform.OS !== "android") {
    return;
  }

  try {
    Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY! });
  } catch (err) {
    console.warn("[revenuecat] Failed to configure Purchases:", err);
  }
}

export async function fetchOfferings() {
  if (isRevenueCatConfigured()) {
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current) {
        return offerings.current;
      }
    } catch (e) {
      console.warn("[revenuecat] Failed to get live offerings, using fallback:", e);
    }
  }
  return ENTITLEMENT_PRODUCT;
}

export async function purchase(plan: "yearly" | "monthly"): Promise<Entitlement> {
  trackPurchase("premium_purchase", plan);

  if (!isRevenueCatConfigured()) {
    // Dev/sandbox simulation
    await new Promise((r) => setTimeout(r, 800));
    return {
      isActive: true,
      plan: plan === "yearly" ? "pro_yearly" : "pro_monthly",
      purchasedAt: Date.now(),
      expiresAt: plan === "yearly" ? Date.now() + 365 * 86400000 : Date.now() + 30 * 86400000,
    };
  }

  try {
    const offerings = await Purchases.getOfferings();
    const pkg =
      plan === "yearly"
        ? offerings.current?.annual
        : offerings.current?.monthly;

    if (!pkg) {
      throw new Error(`Package for ${plan} not found in offerings.`);
    }

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return mapCustomerInfo(customerInfo);
  } catch (err: any) {
    if (err.userCancelled) {
      return { isActive: false, plan: "free" };
    }
    throw err;
  }
}

export async function restorePurchases(): Promise<Entitlement> {
  trackPurchase("premium_restore", undefined);

  if (!isRevenueCatConfigured()) {
    await new Promise((r) => setTimeout(r, 600));
    return { isActive: false, plan: "free" };
  }

  try {
    const info = await Purchases.restorePurchases();
    return mapCustomerInfo(info);
  } catch (err) {
    console.warn("[revenuecat] restorePurchases error:", err);
    return { isActive: false, plan: "free" };
  }
}

function mapCustomerInfo(info: CustomerInfo): Entitlement {
  const isPro = typeof info.entitlements.active["pro"] !== "undefined";
  const plan = isPro ? "pro_yearly" : "free";
  return {
    isActive: isPro,
    plan,
    purchasedAt: Date.now(),
  };
}

function trackPurchase(event: string, plan?: string) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.debug(`[purchase] ${event}`, plan ?? "");
  }
}

export const PRO_FEATURES = [
  { icon: "copy" as const, title: "Similar photos", desc: "Detect near-duplicates with perceptual hashing" },
  { icon: "calendar" as const, title: "Scheduled scans", desc: "Auto-scan every week, stay on top of storage" },
  { icon: "notifications" as const, title: "Storage alerts", desc: "Get notified when storage crosses 90%" },
  { icon: "logo-whatsapp" as const, title: "Advanced WhatsApp", desc: "Bulk rules for received vs sent media" },
  { icon: "sparkles" as const, title: "Smart cleanup rules", desc: "Auto-select blurry, dark, and meme photos" },
  { icon: "ban" as const, title: "No ads", desc: "Enjoy a completely ad-free experience" },
] as const;
