import { z } from 'zod'
import { paginationSchema, uuidSchema } from './common'

export const questionQuerySchema = paginationSchema.extend({
  bankId: uuidSchema.optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  activeOnly: z.boolean().optional()
})

export const importRowErrorSchema = z.object({
  rowNumber: z.number().int(),
  message: z.string()
})

export const importResultSchema = z.object({
  bankId: uuidSchema.optional(),
  fileName: z.string(),
  totalRows: z.number().int(),
  importedCount: z.number().int(),
  skippedDuplicateCount: z.number().int(),
  skippedInvalidCount: z.number().int(),
  errors: z.array(importRowErrorSchema)
})

export const questionBankSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  sourceFilename: z.string().nullable(),
  importedAt: z.string().nullable(),
  questionCount: z.number().int(),
  activeQuestionCount: z.number().int()
})

export const questionListItemSchema = z.object({
  id: uuidSchema,
  text: z.string(),
  category: z.string(),
  difficulty: z.string(),
  points: z.number().int(),
  active: z.boolean(),
  bankIds: z.array(uuidSchema)
})

export const questionPageSchema = z.object({
  items: z.array(questionListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  categories: z.array(z.string())
})

export const exportBankInputSchema = z.object({
  bankId: uuidSchema,
  format: z.literal('xlsx')
})

export type QuestionQuery = z.infer<typeof questionQuerySchema>
export type ImportResult = z.infer<typeof importResultSchema>
export type QuestionBankSummary = z.infer<typeof questionBankSummarySchema>
export type QuestionPage = z.infer<typeof questionPageSchema>
