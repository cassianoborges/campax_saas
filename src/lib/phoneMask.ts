export function formatWhatsapp(value: string): string {
  const withoutPrefix = value.startsWith('+55') ? value.slice(3) : value;
  let digits = withoutPrefix.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';

  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);

  let out = `+55 ${ddd}`;
  if (number.length > 0) {
    out += ` ${number.slice(0, 5)}`;
  }
  if (number.length > 5) {
    out += `-${number.slice(5)}`;
  }
  return out;
}

export function formatCelular(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
