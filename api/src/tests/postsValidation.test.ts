import { describe, expect, it } from 'bun:test'
import type { PayloadRequest } from 'payload'
import { validatePostSlugField, validatePostTitleField } from '@/validations/postsValidation'

const dummyValidationArgs = {
  data: {},
  siblingData: {},
  operation: 'create' as const,
  t: ((k: string) => k) as unknown as never,
  req: {} as unknown as PayloadRequest,
} as unknown as Parameters<typeof validatePostTitleField>[1]

describe('Posts Validation', () => {
  describe('validatePostTitleField', () => {
    it('rejects titles shorter than 3 characters', () => {
      const res = validatePostTitleField('ab', dummyValidationArgs)
      expect(res).toBe('Post title must be between 3 and 100 characters long')
    })

    it('rejects whitespace-only titles', () => {
      const res = validatePostTitleField('   ', dummyValidationArgs)
      expect(res).toBe('Post title must be between 3 and 100 characters long')
    })

    it('rejects titles longer than 100 characters', () => {
      const res = validatePostTitleField('a'.repeat(101), dummyValidationArgs)
      expect(res).toBe('Post title must be between 3 and 100 characters long')
    })

    it('accepts valid titles', () => {
      const res = validatePostTitleField('Valid Post Title', dummyValidationArgs)
      expect(res).toBe(true)
    })
  })

  describe('validatePostSlugField', () => {
    it('rejects uppercase characters', () => {
      const res = validatePostSlugField('Uppercase-Slug', dummyValidationArgs)
      expect(res).toBe(
        'Post slug must be lowercase alphanumeric characters separated by single hyphens (e.g. "my-first-post")',
      )
    })

    it('rejects double hyphens', () => {
      const res = validatePostSlugField('double--hyphen', dummyValidationArgs)
      expect(res).toBe(
        'Post slug must be lowercase alphanumeric characters separated by single hyphens (e.g. "my-first-post")',
      )
    })

    it('rejects special characters and spaces', () => {
      const res = validatePostSlugField('invalid slug!', dummyValidationArgs)
      expect(res).toBe(
        'Post slug must be lowercase alphanumeric characters separated by single hyphens (e.g. "my-first-post")',
      )
    })

    it('accepts valid kebab-case slugs', () => {
      const res = validatePostSlugField('valid-post-slug-123', dummyValidationArgs)
      expect(res).toBe(true)
    })
  })
})
