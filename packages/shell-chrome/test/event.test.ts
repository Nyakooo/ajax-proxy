import { afterEach, describe, expect, it, vi } from 'vitest'

type ActionClickListener = (tab: chrome.tabs.Tab) => void
type CommandListener = (command: string) => void

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('../src/service-worker/panel')
})

describe('service worker event listeners', () => {
  it('routes toolbar clicks and supported commands to panel actions', async () => {
    const actionClickListeners: ActionClickListener[] = []
    const commandListeners: CommandListener[] = []
    const chromeMock = {
      action: {
        onClicked: {
          addListener: vi.fn((listener: ActionClickListener) =>
            actionClickListeners.push(listener)
          ),
        },
      },
      commands: {
        onCommand: {
          addListener: vi.fn((listener: CommandListener) => commandListeners.push(listener)),
        },
      },
    }
    const panelActions = {
      createPanel: vi.fn(),
      closePanel: vi.fn(),
      fullScreenPanel: vi.fn(),
      resizeWindow: vi.fn(),
    }
    vi.stubGlobal('chrome', chromeMock)
    vi.doMock('../src/service-worker/panel', () => panelActions)

    const { injectEventListener } = await import('../src/service-worker/event')
    injectEventListener()

    expect(actionClickListeners).toHaveLength(1)
    expect(commandListeners).toHaveLength(1)

    actionClickListeners[0]({} as chrome.tabs.Tab)
    expect(panelActions.createPanel).toHaveBeenCalledOnce()
    expect(panelActions.closePanel).not.toHaveBeenCalled()
    expect(panelActions.fullScreenPanel).not.toHaveBeenCalled()
    expect(panelActions.resizeWindow).not.toHaveBeenCalled()

    commandListeners[0]('open_panel')
    commandListeners[0]('close_panel')
    commandListeners[0]('full_screen')
    commandListeners[0]('resize_window')

    expect(panelActions.createPanel).toHaveBeenCalledTimes(2)
    expect(panelActions.closePanel).toHaveBeenCalledOnce()
    expect(panelActions.fullScreenPanel).toHaveBeenCalledOnce()
    expect(panelActions.resizeWindow).toHaveBeenCalledOnce()

    commandListeners[0]('unknown_command')
    expect(panelActions.createPanel).toHaveBeenCalledTimes(2)
    expect(panelActions.closePanel).toHaveBeenCalledOnce()
    expect(panelActions.fullScreenPanel).toHaveBeenCalledOnce()
    expect(panelActions.resizeWindow).toHaveBeenCalledOnce()
  })
})
