<script setup lang="ts">
import { getProject, renameProject, whoami } from '#safe-action/actions'

const id = ref('alpha')
const project = await useActionQuery(getProject, () => ({ id: id.value }), { tags: ['projects'] })
const missing = await useActionQuery(getProject, { id: 'missing' })
const me = await useActionQuery(whoami)
const rename = useAction(renameProject, { invalidate: { tags: ['projects'] } })
const anonymous = await useActionQuery(whoami, undefined, { forwardHeaders: false, key: 'whoami:anonymous' })
</script>

<template>
  <div>
    <p id="project">{{ project.data.value?.name }}</p>
    <p id="project-key">{{ project.key.value }}</p>
    <p id="missing">{{ missing.status.value }}:{{ missing.businessError.value?.code }}</p>
    <p id="me">{{ me.data.value?.user }}</p>
    <p id="status">{{ project.status.value }}</p>
    <button id="alpha" @click="id = 'alpha'">alpha</button>
    <button id="beta" @click="id = 'beta'">beta</button>
    <button id="rename" @click="rename.execute({ id: id, name: 'Renamed ' + id })">rename</button>
    <p id="anonymous">{{ anonymous.data.value?.user }}</p>
  </div>
</template>
