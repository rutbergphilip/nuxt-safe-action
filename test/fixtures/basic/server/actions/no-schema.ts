import { actionClient } from '../utils/action-client'

export default actionClient
  .action(async ({ parsedInput }) => {
    return { echo: parsedInput }
  })
