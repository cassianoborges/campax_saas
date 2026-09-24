// Turns a funerária's brand colors into the HSL tokens of src/index.css. cor_primaria replaces the
// gold accent (buttons, highlights, focus rings) and cor_secundaria the navy (dark backgrounds).

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l * 100];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h =
        max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) :
        max === gn ? (bn - rn) / d + 2 :
        (rn - gn) / d + 4;
    return [h * 60, s * 100, l * 100];
}

const triplet = (h: number, s: number, l: number) =>
    `${Math.round(h)} ${Math.round(s)}% ${Math.round(Math.min(100, Math.max(0, l)))}%`;

/** '#C9A227' → '43 68% 47%' (the format used by the CSS tokens). */
export function hexToHslTriplet(hex: string): string | null {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const [h, s, l] = rgbToHsl(rgb);
    return triplet(h, s, l);
}

/** WCAG relative luminance (0 = black, 1 = white). */
function luminance([r, g, b]: Rgb): number {
    const channel = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(hexA: string, hexB: string): number | null {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return null;
    const [la, lb] = [luminance(a), luminance(b)];
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The two text colors the design already uses: cream (light) and deep navy (dark).
const LIGHT_TEXT = { hex: '#F6F3EE', hsl: '40 30% 95%' };
const DARK_TEXT = { hex: '#111827', hsl: '222 35% 10%' };

/** Whichever text color (cream or deep navy) reads better on `hex`. */
export function foregroundFor(hex: string): string {
    const light = contrastRatio(hex, LIGHT_TEXT.hex) ?? 0;
    const dark = contrastRatio(hex, DARK_TEXT.hex) ?? 0;
    return light >= dark ? LIGHT_TEXT.hsl : DARK_TEXT.hsl;
}

export interface BrandColors {
    cor_primaria?: string | null;
    cor_secundaria?: string | null;
}

/** CSS custom properties to set for a funerária's colors (empty when it has none). */
export function brandingVariables({ cor_primaria, cor_secundaria }: BrandColors): Record<string, string> {
    const vars: Record<string, string> = {};

    const primary = cor_primaria ? hexToRgb(cor_primaria) : null;
    if (primary && cor_primaria) {
        const [h, s, l] = rgbToHsl(primary);
        Object.assign(vars, {
            '--gold': triplet(h, s, l),
            '--accent': triplet(h, s, l),
            '--ring': triplet(h, s, l),
            '--gold-light': triplet(h, s, l + 20),
            '--gold-gradient-end': triplet(h, s, l + 10),
            '--gold-foreground': foregroundFor(cor_primaria),
            '--accent-foreground': foregroundFor(cor_primaria),
        });
    }

    const secondary = cor_secundaria ? hexToRgb(cor_secundaria) : null;
    if (secondary && cor_secundaria) {
        const [h, s, l] = rgbToHsl(secondary);
        Object.assign(vars, {
            '--navy': triplet(h, s, l),
            '--primary': triplet(h, s, l),
            '--navy-light': triplet(h, s, l + 15),
            '--navy-gradient-end': triplet(h, s, l + 10),
            '--primary-foreground': foregroundFor(cor_secundaria),
        });
    }

    return vars;
}
