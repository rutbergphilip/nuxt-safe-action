import { defineEventHandler } from 'h3'
import { exclusions, defaults } from '#dev-import-options'

export default defineEventHandler(() => ({ exclusions, defaults }))
