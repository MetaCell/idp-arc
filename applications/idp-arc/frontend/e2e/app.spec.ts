import { test, expect } from '@playwright/test'

test('page has correct title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('idp-arc')
})

test('root element is rendered', async ({ page }) => {
  await page.goto('/')
  const root = page.locator('#root')
  await expect(root).toBeAttached()
})
