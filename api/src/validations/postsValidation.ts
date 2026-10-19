import type { TextFieldValidation } from 'payload'

const POST_SLUG_KEBAB_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const validatePostTitleField: TextFieldValidation = (value) => {
  if (typeof value !== 'string') {
    return 'Post title must be between 3 and 100 characters long'
  }

  const trimmedTitle = value.trim()
  if (trimmedTitle.length < 3 || trimmedTitle.length > 100) {
    return 'Post title must be between 3 and 100 characters long'
  }

  return true
}

export const validatePostSlugField: TextFieldValidation = (value) => {
  if (
    typeof value !== 'string' ||
    value.length < 3 ||
    value.length > 80 ||
    !POST_SLUG_KEBAB_PATTERN.test(value)
  ) {
    return 'Post slug must be lowercase alphanumeric characters separated by single hyphens (e.g. "my-first-post")'
  }

  return true
}
