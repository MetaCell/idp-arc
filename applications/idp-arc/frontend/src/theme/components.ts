import { common } from '@mui/material/colors';
import { createTheme } from '@mui/material/styles';
import { customThemeVariables } from './palette';

export const fontFamilies = {
  body: ['Inter', 'sans-serif'].join(', '),
  display: ['"Adriane Text"', 'serif'].join(', '),
} as const;

export const theme = createTheme({
  cssVariables: true,
  palette: {
    background: {
      default: customThemeVariables.background,
      paper: customThemeVariables.paper,
    },
    primary: {
      main: customThemeVariables.accent,
      contrastText: common.white,
    },
    secondary: {
      main: common.white,
      contrastText: customThemeVariables.background,
    },
    text: {
      primary: common.white,
      secondary: customThemeVariables.textSecondary,
      disabled: customThemeVariables.textDisabled,
    },
    divider: customThemeVariables.divider,
  },
  typography: {
    fontFamily: fontFamilies.body,
    h1: {
      fontFamily: fontFamilies.display,
      fontSize: '3rem',
      fontWeight: 400,
      lineHeight: 'normal',
      color: 'var(--mui-palette-text-primary)',
      letterSpacing: 0,
    },
    h2: {
      fontFamily: fontFamilies.display,
      fontSize: '2rem',
      fontWeight: 400,
      lineHeight: 'normal',
      color: 'var(--mui-palette-text-primary)',
      letterSpacing: '0.04rem',
    },
    h3: {
      fontFamily: fontFamilies.body,
      fontSize: '1.5rem',
      fontWeight: 400,
      lineHeight: '1.6rem',
      color: 'var(--mui-palette-text-primary)',
    },
    h4: {
      fontFamily: fontFamilies.body,
      fontSize: '1.25rem',
      fontWeight: 400,
      lineHeight: '1.6rem',
      color: 'var(--mui-palette-text-primary)',
    },
    body1: {
      fontFamily: fontFamilies.body,
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: '1.6rem',
      color: 'var(--mui-palette-text-secondary)',
    },
    body2: {
      fontFamily: fontFamilies.body,
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: '1.5rem',
      color: 'var(--mui-palette-text-secondary)',
    },
    caption: {
      fontFamily: fontFamilies.body,
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: '1.375rem',
      color: 'var(--mui-palette-text-secondary)',
    },
    button: {
      fontFamily: fontFamilies.body,
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 'normal',
      letterSpacing: 0,
      textTransform: 'none' as const,
    },
    overline: {
      fontFamily: fontFamilies.body,
      fontSize: '1rem',
      fontWeight: 300,
      lineHeight: 'normal',
      letterSpacing: 0,
      textTransform: 'none' as const,
      color: 'var(--mui-palette-text-primary)',
    },
    subtitle1: {
      fontFamily: fontFamilies.body,
      fontSize: '0.875rem',
      fontWeight: 300,
      lineHeight: '1.125rem',
      color: 'var(--mui-palette-text-primary)',
    },
    subtitle2: {
      fontFamily: fontFamilies.body,
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: '1.375rem',
      color: 'var(--mui-palette-text-primary)',
    },
  },
  components: {

    MuiCssBaseline: {
      styleOverrides: `
        html {
          scroll-behavior: smooth;
        }

        body {
          background-color: var(--mui-palette-background-default);
          color: var(--mui-palette-text-primary);
          font-family: ${fontFamilies.body};
        }

        a {
          text-decoration: none;
        }

        b, strong {
          font-weight: 500;
        }

        *::-webkit-scrollbar {
          width: 0.25rem;
        }

        *::-webkit-scrollbar-button {
          height: 0;
        }

        *::-webkit-scrollbar-thumb {
          border-radius: 6.25rem;
          background: var(--mui-palette-divider);
        }

        *::-webkit-scrollbar-track {
          background: transparent;
        }
      `,
    },

    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },

    MuiButton: {
      defaultProps: {
        disableElevation: true,
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.body,
          fontSize: '0.875rem',
          fontWeight: 400,
          lineHeight: 'normal',
          textTransform: 'none' as const,
          letterSpacing: 0,
          borderRadius: 0,
          height: 32,
          minWidth: 0,
          padding: '0.5rem 0.75rem',
          gap: 6,
          '&.Mui-disabled': {
            opacity: 0.5,
          },
        },
        contained: {
          backgroundColor: 'var(--mui-palette-text-primary)',
          color: 'var(--mui-palette-background-default)',
          boxShadow: 'none !important',
          '&:hover': {
            backgroundColor: 'var(--mui-palette-text-secondary)',
          },
        },
        outlined: {
          color: 'var(--mui-palette-text-primary)',
          borderColor: 'var(--mui-palette-divider)',
          '&:hover': {
            backgroundColor: 'var(--mui-palette-background-paper)',
            borderColor: 'var(--mui-palette-text-secondary)',
          },
        },
        text: {
          color: 'var(--mui-palette-text-primary)',
          '&:hover': {
            backgroundColor: 'var(--mui-palette-background-paper)',
            color: 'var(--mui-palette-text-primary)',
          },
        },
      },
    },

    MuiIconButton: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          color: 'var(--mui-palette-text-primary)',
          borderRadius: 100,
          border: `1px solid ${'var(--mui-palette-divider)'}`,
          backgroundColor: 'var(--mui-palette-background-paper)',
          transition: 'opacity 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: 'var(--mui-palette-background-paper)',
          },
          '&.Mui-disabled': {
            opacity: 0.5,
          },
        },
      },
    },

    MuiTypography: {
      defaultProps: {
        variantMapping: {
          h1: 'h1',
          h2: 'h2',
          h3: 'h3',
          h4: 'h4',
          body1: 'p',
          body2: 'p',
          caption: 'span',
          overline: 'span',
          subtitle1: 'span',
          subtitle2: 'span',
        },
      },
    },

    MuiLink: {
      defaultProps: {
        underline: 'none' as const,
      },
      styleOverrides: {
        root: {
          color: 'var(--mui-palette-text-primary)',
          fontFamily: fontFamilies.body,
          fontSize: '0.875rem',
          fontWeight: 400,
          '&:hover': {
            color: 'var(--mui-palette-text-secondary)',
          },
        },
      },
    },

    MuiAppBar: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          boxShadow: 'none',
        },
      },
    },

    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: 72,
          paddingLeft: 100,
          paddingRight: 100,
          justifyContent: 'space-between',
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--mui-palette-background-paper)',
          border: `1px solid ${'var(--mui-palette-divider)'}`,
          borderRadius: 12,
          backgroundImage: 'none',
          boxShadow: 'none',
          transition: 'border-color 0.2s',
          '&:hover': {
            borderColor: 'var(--mui-palette-divider)',
          },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'var(--mui-palette-background-paper)',
          border: `1px solid ${'var(--mui-palette-divider)'}`,
          borderRadius: 0,
        },
        rounded: {
          borderRadius: 12,
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'var(--mui-palette-background-paper)',
        },
      },
    },

    MuiListItem: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${'var(--mui-palette-background-paper)'}`,
          padding: 24,
          gap: 12,
          backgroundColor: 'transparent',
          '&:hover': {
            backgroundColor: 'var(--mui-palette-background-paper)',
          },
        },
      },
    },

    MuiListItemText: {
      styleOverrides: {
        primary: {
          fontFamily: fontFamilies.body,
          fontSize: '1rem',
          fontWeight: 400,
          color: 'var(--mui-palette-text-primary)',
        },
        secondary: {
          fontFamily: fontFamilies.body,
          fontSize: '1rem',
          fontWeight: 400,
          color: 'var(--mui-palette-text-secondary)',
        },
      },
    },

    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: 'var(--mui-palette-text-secondary)',
          minWidth: 'auto',
          marginRight: 12,
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 32,
        },
        indicator: {
          backgroundColor: 'var(--mui-palette-primary-main)',
          height: 2,
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.body,
          fontSize: '0.875rem',
          fontWeight: 400,
          color: 'var(--mui-palette-text-primary)',
          textTransform: 'none' as const,
          minHeight: 32,
          padding: '0.5rem 0.75rem',
          borderRadius: 0,
          '&.Mui-selected': {
            color: 'var(--mui-palette-text-primary)',
            backgroundColor: 'var(--mui-palette-background-paper)',
          },
          '&:hover': {
            backgroundColor: 'var(--mui-palette-background-paper)',
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--mui-palette-background-paper)',
          color: 'var(--mui-palette-text-primary)',
          border: `1px solid ${'var(--mui-palette-divider)'}`,
          borderRadius: 0,
          fontFamily: fontFamilies.body,
          fontSize: '0.875rem',
          fontWeight: 400,
          height: 32,
        },
        label: {
          color: 'inherit',
          padding: '0 0.5rem',
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: 'var(--mui-palette-background-default)',
          border: `1px solid ${'var(--mui-palette-divider)'}`,
          color: 'var(--mui-palette-text-primary)',
          fontFamily: fontFamilies.body,
          fontSize: '0.875rem',
          fontWeight: 400,
          borderRadius: 0,
          maxWidth: '30rem',
        },
        arrow: {
          color: 'var(--mui-palette-background-default)',
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: 'var(--mui-palette-background-default)',
          border: `1px solid ${'var(--mui-palette-divider)'}`,
          borderRadius: 0,
          backgroundImage: 'none',
          padding: '0.25rem 0',
        },
      },
    },

    MuiMenuItem: {
      defaultProps: {
        disableRipple: true,
      },
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.body,
          fontSize: '0.875rem',
          fontWeight: 400,
          color: 'var(--mui-palette-text-primary)',
          padding: '0.5rem 0.75rem',
          '&:hover': {
            backgroundColor: 'var(--mui-palette-background-paper)',
          },
          '&.Mui-selected': {
            backgroundColor: 'var(--mui-palette-background-paper)',
            '&:hover': {
              backgroundColor: 'var(--mui-palette-divider)',
            },
          },
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: 'var(--mui-palette-background-default)',
          border: `1px solid ${'var(--mui-palette-divider)'}`,
          borderRadius: 12,
          backgroundImage: 'none',
        },
        root: {
          '& .MuiBackdrop-root': {
            backdropFilter: 'blur(0.25rem)',
            background: 'rgba(0, 0, 0, 0.6)',
          },
          '& .MuiDialogTitle-root': {
            borderBottom: `1px solid ${'var(--mui-palette-background-paper)'}`,
            fontSize: '1.5rem',
            display: 'flex',
            alignItems: 'center',
          },
          '& .MuiDialogContent-root': {
            padding: 24,
          },
          '& .MuiDialogActions-root': {
            padding: '1rem 1.5rem',
            borderTop: `1px solid ${'var(--mui-palette-background-paper)'}`,
          },
          '& .MuiDivider-root': {
            borderColor: 'var(--mui-palette-background-paper)',
          },
        },
      },
    },

    // ── MuiOutlinedInput ─────────────────────
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.body,
          color: 'var(--mui-palette-text-primary)',
          borderRadius: 0,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--mui-palette-divider)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--mui-palette-text-secondary)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--mui-palette-primary-main)',
          },
        },
        input: {
          padding: '0.5rem 0.75rem',
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.body,
          fontWeight: 400,
          fontSize: '0.875rem',
          color: 'var(--mui-palette-text-secondary)',
          '&.Mui-focused': {
            color: 'var(--mui-palette-text-primary)',
          },
        },
      },
    },

    MuiFormHelperText: {
      styleOverrides: {
        root: {
          fontFamily: fontFamilies.body,
          fontSize: '0.75rem',
          lineHeight: '1.125rem',
          fontWeight: 400,
          color: 'var(--mui-palette-text-secondary)',
          '&.Mui-error': {
            color: '#f44336',
          },
        },
      },
    },

    MuiCircularProgress: {
      defaultProps: {
        color: 'primary' as const,
      },
      styleOverrides: {
        root: {
          color: 'var(--mui-palette-primary-main)',
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--mui-palette-background-paper)',
          borderRadius: 0,
        },
        bar: {
          backgroundColor: 'var(--mui-palette-primary-main)',
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontFamily: fontFamilies.body,
          fontSize: '0.875rem',
        },
      },
    },

    MuiSvgIcon: {
      styleOverrides: {
        root: {
          color: 'inherit',
        },
        fontSizeSmall: {
          width: '1rem',
          height: '1rem',
          fontSize: '1rem',
        },
        fontSizeMedium: {
          width: '1.25rem',
          height: '1.25rem',
          fontSize: '1.25rem',
        },
        fontSizeLarge: {
          width: '2rem',
          height: '2rem',
          fontSize: '2rem',
        },
      },
    },
  },
});
