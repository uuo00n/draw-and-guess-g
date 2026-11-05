import { AppRouter } from '@renderer/app/router'
import { DeveloperCredit } from '@renderer/components/layout/DeveloperCredit'
import { useUiSettings } from '@renderer/stores/ui-settings-store'
import { useEffect } from 'react'

function App(): React.JSX.Element {
  const fullscreen = useUiSettings((state) => state.fullscreen)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'F11') return
      event.preventDefault()
      void window.gameAPI.app.toggleFullscreen().then((enabled) => {
        useUiSettings.getState().setFullscreen(enabled)
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (fullscreen) void window.gameAPI.app.setFullscreen(true)
  }, [fullscreen])

  return (
    <div className="gp-stage flex min-h-screen flex-col">
      <AppRouter />
      <DeveloperCredit />
    </div>
  )
}

export default App
