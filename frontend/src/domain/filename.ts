function baseName(name: string): string {
  const parts = name.split(/[/\\]/);
  return parts[parts.length - 1]!.trim();
}

function usable(name: string | undefined): string | null {
  if (name === undefined) return null;
  const base = baseName(name);
  return base === "" || base === "." || base === ".." ? null : base;
}

export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      const decoded = usable(decodeURIComponent(extended[1]!));
      if (decoded) return decoded;
    } catch {
      // A malformed percent-encoding falls through to the plain parameter.
    }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  const plain = /filename\s*=\s*([^;"\s]+)/i.exec(header);
  return usable(quoted?.[1] ?? plain?.[1]) ?? fallback;
}
