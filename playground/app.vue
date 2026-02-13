<template>
  <div style="max-width: 640px; margin: 2rem auto; font-family: system-ui, sans-serif">
    <h1>nuxt-safe-action playground</h1>

    <!-- Greet Action -->
    <section style="margin-top: 2rem">
      <h2>Greet Action</h2>
      <form @submit.prevent="handleGreet">
        <input
          v-model="greetName"
          placeholder="Enter your name"
          style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; width: 200px"
        />
        <button
          type="submit"
          :disabled="greetAction.isExecuting.value"
          style="margin-left: 0.5rem; padding: 0.5rem 1rem; cursor: pointer"
        >
          {{ greetAction.isExecuting.value ? 'Loading...' : 'Greet' }}
        </button>
      </form>

      <div v-if="greetAction.hasSucceeded.value" style="margin-top: 1rem; color: green">
        {{ greetAction.data.value?.greeting }}
        <br />
        <small>at {{ greetAction.data.value?.timestamp }}</small>
      </div>

      <div v-if="greetAction.hasErrored.value" style="margin-top: 1rem; color: red">
        <div v-if="greetAction.serverError.value">
          Server error: {{ greetAction.serverError.value }}
        </div>
        <div v-if="greetAction.validationErrors.value">
          Validation errors: {{ JSON.stringify(greetAction.validationErrors.value) }}
        </div>
      </div>
    </section>

    <!-- Get User Action (GET method) -->
    <section style="margin-top: 3rem">
      <h2>Get User Action <small style="color: #888">(GET)</small></h2>
      <form @submit.prevent="handleGetUser">
        <input
          v-model="userId"
          placeholder="Enter user ID (1, 2, or 3)"
          style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; width: 200px"
        />
        <button
          type="submit"
          :disabled="getUserAction.isExecuting.value"
          style="margin-left: 0.5rem; padding: 0.5rem 1rem; cursor: pointer"
        >
          {{ getUserAction.isExecuting.value ? 'Loading...' : 'Look up' }}
        </button>
      </form>

      <div
        v-if="getUserAction.hasSucceeded.value"
        style="margin-top: 1rem; padding: 1rem; background: #f0f0f9; border-radius: 4px"
      >
        <strong>User found!</strong>
        <pre style="margin-top: 0.5rem">{{
          JSON.stringify(getUserAction.data.value, null, 2)
        }}</pre>
      </div>

      <div v-if="getUserAction.hasErrored.value" style="margin-top: 1rem; color: red">
        <div v-if="getUserAction.serverError.value">
          Server error: {{ getUserAction.serverError.value }}
        </div>
        <div v-if="getUserAction.validationErrors.value">
          Validation errors: {{ JSON.stringify(getUserAction.validationErrors.value) }}
        </div>
      </div>
    </section>

    <!-- Create Post Action -->
    <section style="margin-top: 3rem">
      <h2>Create Post Action</h2>
      <form @submit.prevent="handleCreatePost">
        <div>
          <input
            v-model="postTitle"
            placeholder="Post title"
            style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; width: 100%"
          />
        </div>
        <div style="margin-top: 0.5rem">
          <textarea
            v-model="postBody"
            placeholder="Post body"
            rows="3"
            style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; width: 100%"
          />
        </div>
        <button
          type="submit"
          :disabled="createPostAction.isExecuting.value"
          style="margin-top: 0.5rem; padding: 0.5rem 1rem; cursor: pointer"
        >
          {{ createPostAction.isExecuting.value ? 'Creating...' : 'Create Post' }}
        </button>
      </form>

      <div
        v-if="createPostAction.hasSucceeded.value"
        style="margin-top: 1rem; padding: 1rem; background: #f0f9f0; border-radius: 4px"
      >
        <strong>Post created!</strong>
        <pre style="margin-top: 0.5rem">{{
          JSON.stringify(createPostAction.data.value, null, 2)
        }}</pre>
      </div>

      <div v-if="createPostAction.hasErrored.value" style="margin-top: 1rem; color: red">
        <div v-if="createPostAction.serverError.value">
          Server error: {{ createPostAction.serverError.value }}
        </div>
        <div v-if="createPostAction.validationErrors.value">
          <div v-for="(errors, field) in createPostAction.validationErrors.value" :key="field">
            <strong>{{ field }}:</strong> {{ errors.join(', ') }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { greet, getUser, createPost } from '#safe-action/actions'

const greetName = ref('')
const userId = ref('')
const postTitle = ref('')
const postBody = ref('')

const greetAction = useAction(greet, {
  onSuccess({ data }) {
    console.log('Greet succeeded:', data)
  },
})

const getUserAction = useAction(getUser, {
  onSuccess({ data }) {
    console.log('User found:', data)
  },
})

const createPostAction = useAction(createPost, {
  onSuccess({ data }) {
    console.log('Post created:', data)
    postTitle.value = ''
    postBody.value = ''
  },
})

function handleGreet() {
  greetAction.execute({ name: greetName.value })
}

function handleGetUser() {
  getUserAction.execute({ id: userId.value })
}

function handleCreatePost() {
  createPostAction.execute({ title: postTitle.value, body: postBody.value })
}
</script>
