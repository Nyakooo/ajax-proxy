import { changeTabPanelSize, closeTabPanel, openTabPanel } from './tabPanel'
import {
  changePopupPanelSize,
  closePopupPanel,
  openPopupPanel,
  type PanelScreen,
} from './popupPanel'

const panelPath = 'panels-v3/index.html'

/** Open the V3 editor in its default popup window or an explicitly requested tab. */
export async function createPanel(
  ruleId?: string,
  ruleAction?: 'response' | 'redirect',
  target: 'window' | 'tab' = 'window',
  screen?: PanelScreen
): Promise<void> {
  if (target === 'tab') {
    await openTabPanel(panelPath, ruleId, ruleAction)
    return
  }
  await openPopupPanel(panelPath, ruleId, ruleAction, screen)
}

/** Close the open V3 popup, falling back to the standalone tab when present. */
export async function closePanel(): Promise<void> {
  if (!(await closePopupPanel(panelPath))) await closeTabPanel(panelPath)
}

/** Toggle the active V3 panel between its standard and expanded size. */
export async function fullScreenPanel(): Promise<void> {
  if (!(await changePopupPanelSize(panelPath, true))) await changeTabPanelSize(panelPath, true)
}

/** Resize the active V3 panel; the tab fallback uses the same resize state. */
export async function resizeWindow(): Promise<void> {
  if (!(await changePopupPanelSize(panelPath, false))) await changeTabPanelSize(panelPath, false)
}
