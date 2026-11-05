import { z } from 'zod'

export const homeSummarySchema = z.object({
  activeQuestionCount: z.number().int(),
  version: z.string()
})

export type HomeSummary = z.infer<typeof homeSummarySchema>
