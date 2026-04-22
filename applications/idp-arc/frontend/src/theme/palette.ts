
import { alpha } from '@mui/material';

export const customThemeVariables = {
  background: '#1a1a1a',
  paper: alpha('#ffffff', 0.05),
  accent: '#613e38',
  textSecondary: alpha('#ffffff', 0.6),
  textDisabled:  alpha('#ffffff', 0.1),
  divider:       alpha('#ffffff', 0.1),
} as const;


