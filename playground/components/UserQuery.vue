<template>
  <section style="margin-top: 3rem">
    <h2>User Query <small style="color: #888">(useActionQuery, SSR + per-input keys)</small></h2>
    <select v-model="id" style="padding: 0.5rem">
      <option v-for="option in ['1', '2', '3', '404']" :key="option" :value="option">User {{ option }}</option>
    </select>
    <p v-if="user.pending.value">Loading…</p>
    <p v-else-if="user.serverError.value" style="color: red">{{ user.serverError.value }}</p>
    <p v-else>{{ name }} &lt;{{ user.data.value?.email }}&gt;</p>
    <small style="color: #888">key: {{ user.key.value }}</small>
  </section>
</template>

<script setup lang="ts">
import { getUser } from '#safe-action/actions'

const id = ref('1')
const user = await useActionQuery(getUser, () => ({ id: id.value }), { tags: ['users'] })
// Inferred from the action's return type.
const name = computed<string | undefined>(() => user.data.value?.name)
</script>
