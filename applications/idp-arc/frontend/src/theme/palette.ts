
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
  surface: {
    low: alpha('#ffffff', 0.03),
    medium: alpha('#ffffff', 0.05),
    high: alpha('#ffffff', 0.08),
  },
} as const;

declare module '@mui/material/styles' {
  interface Palette {
    stroke:  typeof arcPalette.stroke;
    content: typeof arcPalette.content;
    surface: typeof arcPalette.surface;
  }
  interface PaletteOptions {
    stroke?:  Partial<typeof arcPalette.stroke>;
    content?: Partial<typeof arcPalette.content>;
    surface?: Partial<typeof arcPalette.surface>;
  }
}


