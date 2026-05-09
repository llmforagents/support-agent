import { describe, it, expect } from 'vitest'
import { HANDOFF_TOOL, HANDOFF_TOOL_GUIDANCE } from './handoffPrompt'

describe('HANDOFF_TOOL', () => {
  it('has the correct function name', () => {
    expect(HANDOFF_TOOL.function.name).toBe('request_human_handoff')
  })

  it('has type "function"', () => {
    expect(HANDOFF_TOOL.type).toBe('function')
  })

  it('has a non-empty description', () => {
    expect(HANDOFF_TOOL.function.description.length).toBeGreaterThan(0)
  })

  it('parameters type is "object"', () => {
    expect(HANDOFF_TOOL.function.parameters.type).toBe('object')
  })

  it('requires both reason and category', () => {
    expect(HANDOFF_TOOL.function.parameters.required).toContain('reason')
    expect(HANDOFF_TOOL.function.parameters.required).toContain('category')
  })

  it('reason property is type string with a description', () => {
    const reasonProp = HANDOFF_TOOL.function.parameters.properties.reason
    expect(reasonProp.type).toBe('string')
    expect(reasonProp.description.length).toBeGreaterThan(0)
  })

  it('category enum contains all expected values', () => {
    const categoryEnum = HANDOFF_TOOL.function.parameters.properties.category.enum
    const expected = ['user_request', 'frustration', 'out_of_scope', 'sensitive_topic', 'repeated_failure']
    for (const val of expected) {
      expect(categoryEnum).toContain(val)
    }
  })
})

describe('HANDOFF_TOOL_GUIDANCE', () => {
  it('is a non-empty string', () => {
    expect(typeof HANDOFF_TOOL_GUIDANCE).toBe('string')
    expect(HANDOFF_TOOL_GUIDANCE.length).toBeGreaterThan(0)
  })

  it('mentions request_human_handoff tool name', () => {
    expect(HANDOFF_TOOL_GUIDANCE).toContain('request_human_handoff')
  })
})
