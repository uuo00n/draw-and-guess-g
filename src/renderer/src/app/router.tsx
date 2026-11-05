import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@renderer/pages/HomePage'
import { QuestionBankPage } from '@renderer/pages/QuestionBankPage'
import { GameSetupPage } from '@renderer/pages/GameSetupPage'
import { GameSessionPage } from '@renderer/pages/GameSessionPage'

export function AppRouter(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/questions" element={<QuestionBankPage />} />
        <Route path="/setup" element={<GameSetupPage />} />
        <Route path="/session/:gameId" element={<GameSessionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
