export function formatShopAddress(address?: Record<string, string>): string | undefined {
  if (!address) return undefined;

  const fields = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ];
  const formatted = fields.filter(Boolean).join(", ");
  return formatted || undefined;
}
