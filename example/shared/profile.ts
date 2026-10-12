import { z } from 'zod'

// Public validation rules may be shared with the browser. Keep authentication and secrets server-only.
export const profileSchema = z.object({ profile: z.object({
  name: z.string().trim().min(2, 'Use at least two characters'),
  email: z.string().trim().email('Enter a valid email'),
}) })
