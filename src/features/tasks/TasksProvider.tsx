import { useMemo, type ReactNode } from 'react'
import type { Garden } from '../../types'
import { TasksContext, useTasksCompute } from './useTasks'

/** Calcule une seule fois les tâches et la météo du jardin affiché ; `useTasks` les réutilise partout dessous. */
export function TasksProvider({ garden, children }: { garden?: Garden; children: ReactNode }) {
  const value = useTasksCompute(garden)
  const { tasks, weather, weatherError, weatherLoading } = value
  const ctx = useMemo(() => ({ gardenId: garden?.id, value: { tasks, weather, weatherError, weatherLoading } }), [garden?.id, tasks, weather, weatherError, weatherLoading])
  return <TasksContext.Provider value={ctx}>{children}</TasksContext.Provider>
}
