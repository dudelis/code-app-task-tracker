import { createTheme } from '@mui/material/styles'
import type { PaletteMode, Theme } from '@mui/material/styles'

/**
 * Build the app's MUI theme for a given palette mode. Only dark is wired up
 * today, but keeping a mode-parameterised factory (rather than a single frozen
 * theme) means a light/system mode can be added later — e.g. a settings toggle
 * calling `buildTheme('light')` — without touching the shell or its call sites.
 * The indigo/purple accent lives here so there is one place that owns it.
 */
export function buildTheme(mode: PaletteMode = 'dark'): Theme {
  return createTheme({
    palette: {
      mode,
      primary: {
        // Indigo/purple accent used across the app bar, rail selection, and buttons.
        main: '#7c4dff',
      },
      secondary: {
        main: '#5c6bc0',
      },
    },
  })
}

/** The default dark theme applied by the app's single ThemeProvider. */
export const appTheme = buildTheme('dark')
