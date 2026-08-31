export const formatMoney = (n: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 2 }).format(n || 0);

export const formatDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

