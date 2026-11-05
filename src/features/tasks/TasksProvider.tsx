import { useMemo, type ReactNode } from 'react'
import type { Garden } from '../../types'
import { TasksContext, useTasksCompute } from './useTasks'

/** Calcule une seule fois les tâches et la météo du jardin affiché ; `useTasks` les réutilise partout dessous. */
export function TasksProvider({ garden, children }: { garden?: Garden; children: ReactNode }) {
  const value = useTasksCompute(garden)
  const ctx = useMemo(() => ({ gardenId: garden?.id, value }), [garden?.id, value.tasks, value.weather, value.weatherError, value.weatherLoading]) // eslint-disable-line react-hooks/exhaustive-deps
  return <TasksContext.Provider value={ctx}>{children}</TasksContext.Provider>
}
