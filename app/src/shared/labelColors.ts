/**
 * Fill/text colours for a Label chip, keyed by the label's Dataverse colour
 * name. Presentation-only (mirrors the palette the CSS label chips used) so the
 * board's MUI chips read the same across every customer/project.
 */
export const LABEL_COLOR_HEX: Record<string, { bg: string; fg: string }> = {
  Red: { bg: '#e01b24', fg: '#ffffff' },
  Orange: { bg: '#ff7800', fg: '#1a1a1a' },
  Yellow: { bg: '#f6d32d', fg: '#1a1a1a' },
  Green: { bg: '#2ec27e', fg: '#1a1a1a' },
  Blue: { bg: '#3584e4', fg: '#ffffff' },
  Purple: { bg: '#9141ac', fg: '#ffffff' },
  Gray: { bg: '#9a9996', fg: '#1a1a1a' },
}
