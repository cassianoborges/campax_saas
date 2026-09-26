// An <input type="datetime-local"> holds LOCAL time with no timezone. toISOString() would give UTC digits.
export function toDatetimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The input's local value → ISO with the right offset (a bare string would be stored as if it were UTC).
export function fromDatetimeLocalValue(localValue: string): string {
  return new Date(localValue).toISOString();
}
