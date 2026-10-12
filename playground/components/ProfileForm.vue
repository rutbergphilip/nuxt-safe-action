<script setup lang="ts">
import { updateProfile } from '#safe-action/actions'

const { values, submit, data, fieldErrors, rootErrors, serverError, isExecuting, reset } =
  useFormAction(updateProfile, { initialValues: { profile: { name: '', email: '' } } })
</script>

<template>
  <section>
    <h2>Nested profile form</h2>
    <p>Validated demonstration response; no profile is persisted. Try the reserved name “admin”.</p>
    <form @submit.prevent="submit()">
      <label for="profile-name">Name</label>
      <input id="profile-name" v-model="values.profile.name" :aria-invalid="Boolean(fieldErrors['profile.name'])" />
      <p v-for="message in fieldErrors['profile.name']" :key="message" class="error">{{ message }}</p>
      <label for="profile-email">Email</label>
      <input id="profile-email" v-model="values.profile.email" type="email" :aria-invalid="Boolean(fieldErrors['profile.email'])" />
      <p v-for="message in fieldErrors['profile.email']" :key="message" class="error">{{ message }}</p>
      <p v-for="message in rootErrors" :key="message" class="error" role="alert">{{ message }}</p>
      <p v-if="serverError" class="error" role="alert">{{ serverError }}</p>
      <button :disabled="isExecuting">{{ isExecuting ? 'Validating…' : 'Submit profile' }}</button>
      <button type="button" @click="reset()">Reset</button>
      <p v-if="data">Accepted: {{ data.profile.name }} ({{ data.profile.email }})</p>
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
