<script setup lang="ts">
import { ref } from 'vue'
import { toggleTask } from '#safe-action/actions'

const tasks = ref([
  { id: '1', title: 'Try a successful update', done: false },
  { id: 'fail', title: 'Try a server rejection and rollback', done: false },
])
const { execute, optimisticData, isExecuting, serverError, cancel } = useOptimisticAction(toggleTask, {
  currentData: tasks,
  updateFn(input, current) {
    return current.map(task => task.id === input.id ? { ...task, done: input.done } : task)
  },
  onSuccess({ data }) {
    tasks.value = tasks.value.map(task => task.id === data.id ? { ...task, done: data.done } : task)
  },
})
</script>

<template>
  <section>
    <h2>Optimistic mutation</h2>
    <p>Demo state is local. Updates echo after 500ms; the second task always rejects. New clicks replace pending work.</p>
    <ul>
      <li v-for="task in optimisticData" :key="task.id">
        <button :aria-pressed="task.done" @click="execute({ id: task.id, done: !task.done })">
          {{ task.done ? '✓' : '○' }} {{ task.title }}
        </button>
      </li>
    </ul>
    <p v-if="isExecuting">Saving…</p>
    <p v-if="serverError" role="alert">{{ serverError }}</p>
    <button type="button" @click="cancel()">Cancel pending update</button>
  </section>
</template>

<style scoped>
section { margin-top: 2rem; }
button { margin: 0.25rem 0; padding: 0.5rem 0.75rem; }
[role='alert'] { color: #b91c1c; }
</style>
