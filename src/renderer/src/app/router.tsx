import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@renderer/pages/HomePage'
import { QuestionBankPage } from '@renderer/pages/QuestionBankPage'
import { GameSetupPage } from '@renderer/pages/GameSetupPage'
import { GameSessionPage } from '@renderer/pages/GameSessionPage'
import { HistoryPage } from '@renderer/pages/HistoryPage'
import { HistoryDetailPage } from '@renderer/pages/HistoryDetailPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { TeamGroupingPage } from '@renderer/pages/TeamGroupingPage'

export function AppRouter(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/questions" element={<QuestionBankPage />} />
        <Route path="/setup" element={<GameSetupPage />} />
        <Route path="/grouping" element={<TeamGroupingPage />} />
        <Route path="/session/:gameId" element={<GameSessionPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:gameId" element={<HistoryDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
