import { z } from 'zod'

export const homeSummarySchema = z.object({
  activeQuestionCount: z.number().int(),
  version: z.string(),
  rosterGroupCount: z.number().int(),
  rosterMemberCount: z.number().int()
})

export type HomeSummary = z.infer<typeof homeSummarySchema>
