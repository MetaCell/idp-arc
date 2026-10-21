
import { alpha } from '@mui/material';

export const arcPalette = {
  // Standard MUI palette keys
  background: {
    default: '#1A1A1A',
    paper: alpha('#ffffff', 0.05),
  },
  primary: {
    main: '#613e38',
    light: '#8a5e57',
    dark: '#3d2522',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#ffffff',
    contrastText: '#1A1A1A',
  },
  text: {
    primary: '#ffffff',
    secondary: alpha('#ffffff', 0.6),
    disabled: alpha('#ffffff', 0.1),
  },
  divider: alpha('#ffffff', 0.1),

  // ── Custom keys — all become var(--mui-palette-<key>-<token>) ──────────────
  stroke: {
    default: alpha('#ffffff', 0.1),
    active: alpha('#ffffff', 0.2),
    hover: alpha('#ffffff', 0.15),
  },
  content: {
    primary: '#ffffff',
    secondary: alpha('#ffffff', 0.6),
    disabled: alpha('#ffffff', 0.1),
    inverse: '#1A1A1A',
  },
  white: {
    50: alpha('#ffffff', 0.02),
    100: alpha('#ffffff', 0.03),
    200: alpha('#ffffff', 0.05),
    300: alpha('#ffffff', 0.08),
  },
  brand: {
    100: alpha('#613e38', 0.05),  // rgba(97,62,56,0.05)
    200: alpha('#613e38', 0.1),   // rgba(97,62,56,0.10)
    400: alpha('#613e38', 0.4),   // rgba(97,62,56,0.40)
  },
  brandGradient: {
    warm:   alpha('#613e38', 0.4),  // brand primary tint  — rgba(97,62,56,0.4)
    midtone: alpha('#392b22', 0.4), // mid dark-brown tint — rgba(57,43,34,0.4)
    cool:   alpha('#1d2318', 0.4),  // dark olive tint     — rgba(29,35,24,0.4)
  },
  // Black tints
  black: {
    100: alpha('#000000', 0.6),   // rgba(0,0,0,0.60)
    200: alpha('#000000', 0.75),  // rgba(0,0,0,0.75) — modal backdrop
  },
} as const;

declare module '@mui/material/styles' {
  interface Palette {
    stroke:  typeof arcPalette.stroke;
    content: typeof arcPalette.content;
    white:   typeof arcPalette.white;
    brand:   typeof arcPalette.brand;
    black:   typeof arcPalette.black;
    brandGradient: typeof arcPalette.brandGradient;
  }
  interface PaletteOptions {
    stroke?:  Partial<typeof arcPalette.stroke>;
    content?: Partial<typeof arcPalette.content>;
    white?:   Partial<typeof arcPalette.white>;
    brand?:   Partial<typeof arcPalette.brand>;
    black?:   Partial<typeof arcPalette.black>;
    brandGradient?: Partial<typeof arcPalette.brandGradient>;
  }
}


