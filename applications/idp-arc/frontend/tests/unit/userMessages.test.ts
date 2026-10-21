// What the user reads when a run fails (core/userMessages.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { userMessage, UserFacingError } from '../../src/core/userMessages'

test('an error written for the user is shown as is', () => {
  assert.equal(userMessage(new UserFacingError('Not signed in; please sign in again', 'token expired'), 'upload'),
    'Not signed in; please sign in again')
})

test('any other error shows only its step\'s plain sentence', () => {
  assert.equal(userMessage(new Error('Starting the notebooks failed: 500 Internal Server Error'), 'run'),
    'The analysis did not finish. Open the workspace to see what happened.')
  assert.equal(userMessage(new Error('boom')), 'Something went wrong. Please try again.')
})

test('an ended session says to sign in again, whichever step asked for the token', () => {
  assert.equal(userMessage(new Error('No access token available. Please sign in again.'), 'imports'),
    'Your session has expired. Please sign in again.')
})
