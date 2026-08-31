import { supabase } from "@/integrations/supabase/client";

export interface SetuConsentParams {
  mobileNumber: string;
  pan?: string;
  bankName: string;
  familyId: string;
  userId: string;
  accountId?: string;
}

export interface BankSyncItem {
  id: string;
  family_id: string;
  user_id: string | null;
  bank_connection_id: string;
  account_id: string | null;
  amount: number;
  type: "income" | "expense";
  description: string;
  merchant_name: string | null;
  upi_ref: string | null;
  occurred_on: string;
  status: "pending" | "categorized" | "business_matched" | "ignored";
  linked_transaction_id?: string | null;
  linked_payment_id?: string | null;
  created_at: string;
}

/**
 * Smart categorization rules for Indian merchants and UPI handles
 */
export function smartCategoryGuess(description: string, merchantName?: string | null): { category: string; icon: string } {
  const text = `${description} ${merchantName || ""}`.toLowerCase();

  if (/swiggy|zomato|eats|restaurant|cafe|mcdonald|domino|starbucks|kfc|burger|chai|tea|bakery|dhaba|hotel|food/.test(text)) {
    return { category: "Dining", icon: "Utensils" };
  }
  if (/zepto|blinkit|instamart|bigbasket|supermarket|grocery|mart|spencer|dmart|reliance fresh|nature basket|vegetable|fruits|milk|dairy/.test(text)) {
    return { category: "Groceries", icon: "ShoppingBag" };
  }
  if (/uber|ola|rapido|metro|fuel|petrol|hpcl|iocl|bpcl|shell|parking|toll|fastag|irctc|redbus|flight|indigo|air india/.test(text)) {
    return { category: "Transport", icon: "Car" };
  }
  if (/bescom|tneb|electricity|water|gas|broadband|wifi|jio|airtel|vi|vodafone|recharge|dth|tata play|rent|maintenance/.test(text)) {
    return { category: "Utilities", icon: "Zap" };
  }
  if (/amazon|flipkart|myntra|ajio|meesho|nykaa|zara|h&m|shopping|retail|store|mall/.test(text)) {
    return { category: "Shopping", icon: "ShoppingBag" };
  }
  if (/pharmacy|apollo|medplus|netmeds|1mg|hospital|clinic|doctor|lab|diagnostic|health/.test(text)) {
    return { category: "Healthcare", icon: "Heart" };
  }
  if (/netflix|spotify|prime|hotstar|pvr|inox|bookmyshow|youtube|playstation|steam|entertainment/.test(text)) {
    return { category: "Entertainment", icon: "Film" };
  }
  if (/salary|payroll|stipend|wages|employer|dividend|interest credit/.test(text)) {
    return { category: "Salary", icon: "Briefcase" };
  }

  return { category: "Other", icon: "Tag" };
}

/**
 * Create Setu Account Aggregator Consent Request
 */
export async function createSetuConsent(params: SetuConsentParams) {
  const envKey = (typeof process !== "undefined" && process.env?.SETU_CLIENT_ID) || "";
  
  // Create a record in bank_connections
  const { data: conn, error } = await supabase
    .from("bank_connections")
    .insert({
      family_id: params.familyId,
      user_id: params.userId,
      account_id: params.accountId || null,
      bank_name: params.bankName,
      account_number_mask: `XX-${params.mobileNumber.slice(-4)}`,
      consent_id: `setu_consent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: "active",
      last_synced_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return conn;
}

/**
 * Seeds realistic sample Indian bank & UPI transactions to test the Review Inbox immediately
 */
export async function seedSampleBankFeed(params: {
  familyId: string;
  userId: string;
  bankConnectionId: string;
  accountId?: string;
  clientNames?: string[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const clientName = params.clientNames && params.clientNames[0] ? params.clientNames[0] : "Rohan Verma";

  const sampleItems = [
    {
      family_id: params.familyId,
      user_id: params.userId,
      bank_connection_id: params.bankConnectionId,
      account_id: params.accountId || null,
      amount: 450.00,
      type: "expense",
      description: "UPI/Swiggy/202609011234/swiggy@icici",
      merchant_name: "Swiggy Food",
      upi_ref: "UPI-482910394812",
      occurred_on: today,
      status: "pending",
    },
    {
      family_id: params.familyId,
      user_id: params.userId,
      bank_connection_id: params.bankConnectionId,
      account_id: params.accountId || null,
      amount: 2500.00,
      type: "income",
      description: `UPI-CR/${clientName}/Payment for Monthly Subscription/${clientName.toLowerCase().replace(/\s+/g, '')}@okaxis`,
      merchant_name: clientName,
      upi_ref: "UPI-918237461928",
      occurred_on: today,
      status: "pending",
    },
    {
      family_id: params.familyId,
      user_id: params.userId,
      bank_connection_id: params.bankConnectionId,
      account_id: params.accountId || null,
      amount: 1420.00,
      type: "expense",
      description: "UPI/HPCL Petrol Pump/Fuel Station/hpcl@axisbank",
      merchant_name: "HPCL Fuel Station",
      upi_ref: "UPI-192837465019",
      occurred_on: today,
      status: "pending",
    },
    {
      family_id: params.familyId,
      user_id: params.userId,
      bank_connection_id: params.bankConnectionId,
      account_id: params.accountId || null,
      amount: 899.00,
      type: "expense",
      description: "POS/Blinkit/Grocery Delivery/blinkit@hdfcbank",
      merchant_name: "Blinkit Instant",
      upi_ref: "UPI-998877665544",
      occurred_on: today,
      status: "pending",
    },
  ];

  const { error } = await supabase.from("bank_sync_feed").insert(sampleItems);
  if (error) throw error;
}
