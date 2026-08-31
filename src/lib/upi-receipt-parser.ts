export interface ParsedReceipt {
  amount: number | null;
  type: "income" | "expense";
  isSelfTransfer: boolean;
  merchantOrSender: string;
  upiRef: string | null;
  date: string;
  accountMask: string | null;
  fromAccountMask: string | null;
  toAccountMask: string | null;
  categorySuggestion: string;
  rawText: string;
}

/**
 * Robust regex parser for Indian Bank SMS, UPI receipts (GPay, PhonePe, Paytm, Super.money, Cred, BHIM, Axis, HDFC, SBI, ICICI)
 */
export function parseBankOrUpiReceipt(rawText: string): ParsedReceipt {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. Determine Self Transfer / Type: Income vs Expense
  const isSelf = /\b(self transfer|to self|transferred to self|own account|transfer to own|between your accounts)\b/i.test(text);

  const isIncome = !isSelf && /\b(credited|credit|received|deposit|deposited|refund|refunded|added to your|received from|received in|transferred to your)\b/i.test(text) &&
    !/\b(refund for debit|failed credit)\b/i.test(text);
  const type: "income" | "expense" = isIncome ? "income" : "expense";

  // 2. Extract Amount
  // Matches: ₹450, Rs. 1,200.50, INR 5000, Rs450, ₹ 2500
  let amount: number | null = null;
  const amountMatch = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    text.match(/paid\s+(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr)/i);

  if (amountMatch && amountMatch[1]) {
    const cleanNum = amountMatch[1].replace(/,/g, "");
    amount = parseFloat(cleanNum) || null;
  }

  // 3. Extract UPI Ref / UTR / Txn ID
  let upiRef: string | null = null;
  const upiMatch = text.match(/(?:upi\s*ref(?:erence)?(?:\s*no\.?|\s*id)?|rrn|utr|txn\s*(?:id|no\.?)|transaction\s*id)[\s:=]+([a-zA-Z0-9_-]+)/i) ||
    text.match(/\b(\d{12})\b/); // standard 12-digit UPI RRN
  if (upiMatch && upiMatch[1]) {
    upiRef = upiMatch[1].trim();
  }

  // 4. Extract Account Numbers (From Account & To Account)
  let accountMask: string | null = null;
  let fromAccountMask: string | null = null;
  let toAccountMask: string | null = null;

  const fromAccMatch = text.match(/(?:from\s+a\/c|from\s+account|debited\s+from\s+a\/c)\s*([xX*]*\d{3,4})/i);
  const toAccMatch = text.match(/(?:to\s+a\/c|to\s+account|credited\s+to\s+a\/c)\s*([xX*]*\d{3,4})/i);
  const genericAccMatch = text.match(/(?:a\/c|account|acct)\s*(?:no\.?)?\s*(?:ending\s*)?([xX*]*\d{3,4})/i) ||
    text.match(/(?:sbi|hdfc|icici|axis|kotak|pnb|bob|canara|paytm|airtel)\s*(?:bank|a\/c)?\s*([xX*]*\d{3,4})/i);

  if (fromAccMatch && fromAccMatch[1]) fromAccountMask = fromAccMatch[1].replace(/[xX*]/g, "").trim();
  if (toAccMatch && toAccMatch[1]) toAccountMask = toAccMatch[1].replace(/[xX*]/g, "").trim();
  if (genericAccMatch && genericAccMatch[1]) accountMask = genericAccMatch[1].replace(/[xX*]/g, "").trim();
  if (!accountMask) accountMask = fromAccountMask || toAccountMask;

  // 5. Extract Date
  let date = new Date().toISOString().slice(0, 10);
  const dateMatch = text.match(/(\d{1,2})[-/.](\d{1,2}|[a-zA-Z]{3})[-/.](\d{2,4})/);
  if (dateMatch) {
    try {
      const day = parseInt(dateMatch[1], 10);
      const monthPart = dateMatch[2];
      let year = parseInt(dateMatch[3], 10);
      if (year < 100) year += 2000;

      const months: Record<string, number> = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };

      let month = parseInt(monthPart, 10);
      if (isNaN(month)) {
        month = months[monthPart.toLowerCase().slice(0, 3)] || (new Date().getMonth() + 1);
      }

      const formattedMonth = String(month).padStart(2, "0");
      const formattedDay = String(day).padStart(2, "0");
      date = `${year}-${formattedMonth}-${formattedDay}`;
    } catch {
      // fallback to today
    }
  }

  // 6. Extract Merchant or Person Name
  let merchantOrSender = "";

  // Common UPI patterns:
  // "Paid to Swiggy", "Sent to Rohan", "Received from Amit", "VPA swiggy@icici", "UPI/Blinkit/..."
  const toMatch = text.match(/(?:paid to|sent to|transfer(?:red)? to|to\s*vpa|to)\s+([A-Za-z0-9\s&._'-]+?)(?=\s+(?:on|for|ref|upi|using|via|from|a\/c|\.|\n|$))/i);
  const fromMatch = text.match(/(?:received from|transferred from|from)\s+([A-Za-z0-9\s&._'-]+?)(?=\s+(?:on|for|ref|upi|using|via|to|a\/c|\.|\n|$))/i);
  const vpaMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z]+)/);
  const upiSlashMatch = text.match(/upi\/([A-Za-z0-9\s._-]+)\//i);

  if (isIncome && fromMatch && fromMatch[1]) {
    merchantOrSender = fromMatch[1].trim();
  } else if (!isIncome && toMatch && toMatch[1]) {
    merchantOrSender = toMatch[1].trim();
  } else if (upiSlashMatch && upiSlashMatch[1]) {
    merchantOrSender = upiSlashMatch[1].trim();
  } else if (vpaMatch && vpaMatch[1]) {
    merchantOrSender = vpaMatch[1].split("@")[0].replace(/[._-]/g, " ").trim();
  } else {
    // Fallback: search popular brands
    const brands = [
      "Swiggy", "Zomato", "Blinkit", "Zepto", "Instamart", "BigBasket", "Amazon", "Flipkart", 
      "Uber", "Ola", "Rapido", "Petrol", "HPCL", "IOCL", "BPCL", "Shell", "Bescom", "TNEB", 
      "Airtel", "Jio", "Vi", "Netflix", "Spotify", "BookMyShow", "Apollo", "1mg", "Netmeds", "DMart"
    ];
    for (const b of brands) {
      if (new RegExp(`\\b${b}\\b`, "i").test(text)) {
        merchantOrSender = b;
        break;
      }
    }
  }

  if (!merchantOrSender) {
    merchantOrSender = isIncome ? "UPI Deposit / Transfer" : "UPI Payment";
  }

  // Capitalize properly
  merchantOrSender = merchantOrSender
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 40);

  // 7. Auto-suggest Category
  let categorySuggestion = "Other";
  const searchCorpus = `${merchantOrSender} ${text}`.toLowerCase();

  if (/swiggy|zomato|eats|restaurant|cafe|mcdonald|domino|starbucks|kfc|burger|chai|tea|bakery|dhaba|hotel|food|canteen|bistro/.test(searchCorpus)) {
    categorySuggestion = "Dining";
  } else if (/zepto|blinkit|instamart|bigbasket|supermarket|grocery|mart|spencer|dmart|reliance fresh|nature basket|vegetable|fruits|milk|dairy|kirana/.test(searchCorpus)) {
    categorySuggestion = "Groceries";
  } else if (/uber|ola|rapido|metro|fuel|petrol|hpcl|iocl|bpcl|shell|parking|toll|fastag|irctc|redbus|flight|indigo|air india|auto/.test(searchCorpus)) {
    categorySuggestion = "Transport";
  } else if (/bescom|tneb|electricity|water|gas|broadband|wifi|jio|airtel|vi|vodafone|recharge|dth|tata play|rent|maintenance|bill/.test(searchCorpus)) {
    categorySuggestion = "Utilities";
  } else if (/amazon|flipkart|myntra|ajio|meesho|nykaa|zara|h&m|shopping|retail|store|mall|cloth|apparel/.test(searchCorpus)) {
    categorySuggestion = "Shopping";
  } else if (/pharmacy|apollo|medplus|netmeds|1mg|hospital|clinic|doctor|lab|diagnostic|health|medicine/.test(searchCorpus)) {
    categorySuggestion = "Healthcare";
  } else if (/netflix|spotify|prime|hotstar|pvr|inox|bookmyshow|youtube|playstation|steam|entertainment|movie/.test(searchCorpus)) {
    categorySuggestion = "Entertainment";
  } else if (/salary|payroll|stipend|wages|employer|dividend|interest credit/.test(searchCorpus)) {
    categorySuggestion = "Salary";
  }

  return {
    amount,
    type,
    merchantOrSender,
    upiRef,
    date,
    accountMask,
    categorySuggestion,
    rawText: text,
  };
}
