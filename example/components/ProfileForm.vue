<script setup lang="ts">
import { computed, ref } from 'vue'
import { getProfileSummary, updateProfile } from '#safe-action/actions'
import { profileSchema } from '#shared/profile'

const summaryKey = 'demo:profile-summary'
useActionQueryTags(summaryKey, ['profiles'])
const readSummary = useAction(getProfileSummary)
const { data: summary, error: summaryError, refresh: refreshSummary } = await useAsyncData(summaryKey, async () => {
  const result = await readSummary.executeAsync(undefined)
  if (result.data === undefined) throw createError({ statusCode: 500, statusMessage: 'Could not load demo activity' })
  return result.data
})

const lastAcceptedInput = ref<{ profile: { name: string; email: string } }>()
const {
  values, submit, data, fieldErrors, rootErrors, serverError, businessError,
  isExecuting, isRefreshing, refreshError, isDirty, isTouched, isValidating,
  getFieldValue, setFieldValue, getFieldErrors, setTouched, validate, reset,
} = useFormAction(updateProfile, {
  initialValues: { profile: { name: '', email: '' } },
  clientSchema: profileSchema,
  invalidate: { tags: ['profiles'] },
  onSuccess({ input }) {
    lastAcceptedInput.value = { profile: { ...input.profile } }
  },
})
const name = computed({ get: () => getFieldValue('profile.name') ?? '', set: value => setFieldValue('profile.name', value) })
const email = computed({ get: () => getFieldValue('profile.email') ?? '', set: value => setFieldValue('profile.email', value) })
const editAfterSubmit = computed(() => data.value !== undefined && lastAcceptedInput.value !== undefined && (
  values.value.profile.name !== lastAcceptedInput.value.profile.name || values.value.profile.email !== lastAcceptedInput.value.profile.email
))
</script>

<template>
  <section>
    <h2>Profile form with business errors and query refresh</h2>
    <p>Demo only: profiles are not stored. Try “taken@example.com” for a duplicate, or “admin” for a reserved name.</p>
    <p>Edit a field while saving: the submitted snapshot and your newer edits stay separate.</p>
    <p v-if="summary">Accepted demo submissions: <strong data-testid="profile-count">{{ summary.acceptedProfiles }}</strong></p>
    <p v-if="summaryError" class="error" role="alert">Demo activity could not be loaded.</p>
    <form @submit.prevent="submit()">
      <label for="profile-name">Name</label>
      <input id="profile-name" v-model="name" :aria-invalid="Boolean(fieldErrors['profile.name'])" @blur="setTouched('profile.name')" />
      <p v-for="message in getFieldErrors('profile.name')" :key="message" class="error">{{ message }}</p>
      <label for="profile-email">Email</label>
      <input id="profile-email" v-model="email" type="email" :aria-invalid="Boolean(fieldErrors['profile.email'])" @blur="setTouched('profile.email')" />
      <p v-for="message in getFieldErrors('profile.email')" :key="message" class="error">{{ message }}</p>
      <p v-for="message in rootErrors" :key="message" class="error" role="alert">{{ message }}</p>
      <p v-if="businessError?.code === 'EMAIL_TAKEN'" class="error" role="alert">{{ businessError.message }}</p>
      <p v-if="serverError" class="error" role="alert">{{ serverError }}</p>
      <p>Changed from initial values: {{ isDirty ? 'yes' : 'no' }}. Field visited: {{ isTouched ? 'yes' : 'no' }}.</p>
      <button :disabled="isExecuting || isValidating">{{ isExecuting ? 'Saving snapshot…' : 'Submit profile' }}</button>
      <button type="button" :disabled="isExecuting || isValidating" @click="validate()">Check form locally</button>
      <button type="button" @click="reset()">Reset to initial values</button>
      <p v-if="data">Accepted snapshot: {{ data.profile.name }} ({{ data.profile.email }})</p>
      <p v-if="editAfterSubmit">Your newer edits are still in the inputs.</p>
      <p v-if="isRefreshing" role="status">Refreshing demo activity…</p>
      <p v-if="refreshError" class="error" role="alert">The profile was accepted, but activity refresh failed.</p>
      <button v-if="refreshError || summaryError" type="button" @click="refreshSummary()">Reload demo activity</button>
    </form>
  </section>
</template>

<style scoped>
section { margin-top: 2rem; }
label { display: block; margin-top: 0.75rem; }
input { display: block; padding: 0.5rem; width: min(100%, 24rem); }
button { margin: 0.75rem 0.5rem 0 0; padding: 0.5rem 0.75rem; }
.error { color: #b91c1c; }
</style>
