import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openPopupPanel: vi.fn(),
  closePopupPanel: vi.fn(),
  changePopupPanelSize: vi.fn(),
  openTabPanel: vi.fn(),
  closeTabPanel: vi.fn(),
  changeTabPanelSize: vi.fn(),
}))

vi.mock('../src/service-worker/popupPanel', () => ({
  openPopupPanel: mocks.openPopupPanel,
  closePopupPanel: mocks.closePopupPanel,
  changePopupPanelSize: mocks.changePopupPanelSize,
}))

vi.mock('../src/service-worker/tabPanel', () => ({
  openTabPanel: mocks.openTabPanel,
  closeTabPanel: mocks.closeTabPanel,
  changeTabPanelSize: mocks.changeTabPanelSize,
}))

async function loadPanel() {
  vi.resetModules()
  return import('../src/service-worker/panel')
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('V3 service worker panel routing', () => {
  it('opens the standalone popup by default and keeps the selected edit action', async () => {
    const panel = await loadPanel()
    const screen = { left: 0, top: 0, width: 1440, height: 900 }

    await panel.createPanel('rule-2', 'redirect', 'window', screen)

    expect(mocks.openPopupPanel).toHaveBeenCalledExactlyOnceWith(
      'panels-v3/index.html',
      'rule-2',
      'redirect',
      screen
    )
    expect(mocks.openTabPanel).not.toHaveBeenCalled()
  })

  it('opens the editor in a tab when explicitly requested', async () => {
    const panel = await loadPanel()

    await panel.createPanel('rule-1', 'response', 'tab')

    expect(mocks.openTabPanel).toHaveBeenCalledExactlyOnceWith(
      'panels-v3/index.html',
      'rule-1',
      'response'
    )
    expect(mocks.openPopupPanel).not.toHaveBeenCalled()
  })

  it('closes the popup first and falls back to the editor tab when needed', async () => {
    const panel = await loadPanel()
    mocks.closePopupPanel.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await panel.closePanel()
    await panel.closePanel()

    expect(mocks.closePopupPanel).toHaveBeenCalledTimes(2)
    expect(mocks.closeTabPanel).toHaveBeenCalledExactlyOnceWith('panels-v3/index.html')
  })

  it('falls back to the tab when resizing the popup is unavailable', async () => {
    const panel = await loadPanel()
    mocks.changePopupPanelSize.mockResolvedValue(false)

    await panel.fullScreenPanel()
    await panel.resizeWindow()

    expect(mocks.changePopupPanelSize).toHaveBeenNthCalledWith(1, 'panels-v3/index.html', true)
    expect(mocks.changePopupPanelSize).toHaveBeenNthCalledWith(2, 'panels-v3/index.html', false)
    expect(mocks.changeTabPanelSize).toHaveBeenNthCalledWith(1, 'panels-v3/index.html', true)
    expect(mocks.changeTabPanelSize).toHaveBeenNthCalledWith(2, 'panels-v3/index.html', false)
  })
})
