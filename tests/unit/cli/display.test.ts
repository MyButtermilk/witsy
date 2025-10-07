import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { displayHeader, displayFooter, displayConversation, repositionFooter, updateFooterRightText, resetDisplay, clearFooter, eraseLines, displayCommandSuggestions, displayShortcutHelp, clearShortcutHelp, getDefaultFooterRightText, padContent } from '../../../src/cli/display'
import { state } from '../../../src/cli/state'
import { VirtualTerminal } from './VirtualTerminal'
import { ChatCli, MessageCli } from '../../../src/cli/models'

describe('CLI Display Requirements', () => {
  let terminal: VirtualTerminal
  let originalLog: typeof console.log
  let originalWrite: typeof process.stdout.write
  let originalClear: typeof console.clear
  let originalColumns: number | undefined

  beforeEach(() => {
    // Create virtual terminal
    terminal = new VirtualTerminal(80, 24)

    // Save original functions
    originalLog = console.log
    originalWrite = process.stdout.write
    originalClear = console.clear
    originalColumns = process.stdout.columns

    // Mock to use virtual terminal
    console.log = (...args: any[]) => terminal.log(...args)
    process.stdout.write = ((text: any) => {
      terminal.write(text)
      return true
    }) as any
    console.clear = () => terminal.clear()

    // Set terminal width
    Object.defineProperty(process.stdout, 'columns', {
      value: 80,
      writable: true,
      configurable: true
    })

    // Reset state
    state.port = 8090
    state.engine = { id: 'openai', name: 'OpenAI' }
    state.model = { id: 'gpt-4', name: 'GPT-4' }
    state.chat = new ChatCli('CLI Session')
    state.chat.uuid = ''
  })

  afterEach(() => {
    // Restore
    console.log = originalLog
    process.stdout.write = originalWrite
    console.clear = originalClear
    if (originalColumns !== undefined) {
      Object.defineProperty(process.stdout, 'columns', {
        value: originalColumns,
        writable: true,
        configurable: true
      })
    }
    vi.clearAllMocks()
  })

  describe('Requirement: Initial Display', () => {
    test('should show complete initial layout with prompt and footer', async () => {
      // Act: Display initial screen
      displayHeader()
      displayConversation()  // empty
      displayFooter()
      process.stdout.write('>')  // Simulate prompt appearing at cursor

      // Assert: Exact expected output per requirements
      // HEADER
      // SEPARATOR
      // PROMPT WHERE CURSOR IS
      // SEPARATOR
      // FOOTER (current model + number of messages)
      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


────────────────────────────────────────────────────────────────────────────────
>
────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                               ? for shortcuts  `

      expect(terminal.getVisibleText()).toBe(expected)
    })
  })

  describe('Requirement: After User Message', () => {
    test('should show layout with user message', async () => {
      // Arrange: User submitted "hello"
      const userMsg = new MessageCli('user', 'hello')
      state.chat.addMessage(userMsg)

      // Act: Display after user message
      // HEADER
      // blank line
      // hello
      // blank line
      // SEPARATOR
      // PROMPT WHERE CURSOR IS
      // SEPARATOR
      // FOOTER
      displayHeader()
      displayConversation()
      displayFooter()
      process.stdout.write('>')  // Simulate prompt appearing at cursor

      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


> hello

────────────────────────────────────────────────────────────────────────────────
>
────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                                    1 messages  `

      expect(terminal.getVisibleText()).toBe(expected)
    })
  })

  describe('Requirement: After Conversation', () => {
    test('should show layout with full conversation', async () => {
      // Arrange: User said "hello", assistant replied "Hello how are you?"
      const userMsg = new MessageCli('user', 'hello')
      const assistantMsg = new MessageCli('assistant', 'Hello how are you?')
      state.chat.addMessage(userMsg)
      state.chat.addMessage(assistantMsg)

      // Act: Display after assistant response
      // HEADER
      // blank line
      // hello
      // blank line
      // Hello how are you?
      // blank line
      // SEPARATOR
      // PROMPT WHERE CURSOR IS
      // SEPARATOR
      // FOOTER
      displayHeader()
      displayConversation()
      displayFooter()
      process.stdout.write('>')  // Simulate prompt appearing at cursor

      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


> hello

  Hello how are you?

────────────────────────────────────────────────────────────────────────────────
>
────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                                    2 messages  `

      expect(terminal.getVisibleText()).toBe(expected)
    })
  })

  describe('Requirement: Multiple Messages', () => {
    test('should show layout with multiple exchanges', async () => {
      // Arrange: Multiple message exchanges
      state.chat.addMessage(new MessageCli('user', 'Tell me a joke'))
      state.chat.addMessage(new MessageCli('assistant', 'Why did the chicken cross the road?'))
      state.chat.addMessage(new MessageCli('user', 'Why?'))
      state.chat.addMessage(new MessageCli('assistant', 'To get to the other side!'))

      // Act
      displayHeader()
      displayConversation()
      displayFooter()
      process.stdout.write('>')  // Simulate prompt appearing at cursor

      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


> Tell me a joke

  Why did the chicken cross the road?

> Why?

  To get to the other side!

────────────────────────────────────────────────────────────────────────────────
>
────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                       4 messages · type /save  `

      expect(terminal.getVisibleText()).toBe(expected)
    })
  })

  describe('Requirement: Save Status in Footer', () => {
    test('should show auto-saving status when chat is saved', async () => {
      // Arrange: Saved chat with UUID
      state.chat.addMessage(new MessageCli('user', 'hello'))
      state.chat.addMessage(new MessageCli('assistant', 'hi there'))
      state.chat.uuid = 'some-uuid-123'

      // Act
      displayHeader()
      displayConversation()
      displayFooter()
      process.stdout.write('>')

      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


> hello

  hi there

────────────────────────────────────────────────────────────────────────────────
>
────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                      2 messages · auto-saving  `

      expect(terminal.getVisibleText()).toBe(expected)
    })
  })

  describe('Requirement: Footer Repositioning for Multi-line Input', () => {
    test('should move footer down when input wraps from 1 to 2 lines', () => {
      // Arrange: Display initial layout with 1-line prompt
      displayHeader()
      displayConversation()
      displayFooter()
      process.stdout.write('> ')  // Initial prompt

      // Get initial cursor position (where prompt is)
      const initialInputY = terminal.getCursorPosition().row

      // Act: Simulate input wrapping to 2 lines
      // When user types a long line that wraps, repositionFooter is called
      repositionFooter(initialInputY, 1, 2)

      // Assert: Footer should have moved down 1 line (prompt > was erased by repositionFooter)
      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                               ? for shortcuts  `

      expect(terminal.getVisibleText()).toBe(expected)
    })

    test('should move footer down multiple lines for very long input', () => {
      // Arrange: Initial display
      displayHeader()
      displayConversation()
      displayFooter()
      process.stdout.write('> ')

      const initialInputY = terminal.getCursorPosition().row

      // Act: Simulate input wrapping to 3 lines (e.g., large paste)
      repositionFooter(initialInputY, 1, 3)

      // Assert: Footer should have moved down 2 lines (prompt was erased)
      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


────────────────────────────────────────────────────────────────────────────────


────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                               ? for shortcuts  `

      expect(terminal.getVisibleText()).toBe(expected)
    })

    test('should move footer up when input shrinks from 2 to 1 line', () => {
      // Arrange: Start with 2-line input (footer already moved down)
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row

      // First move footer down for 2-line input
      repositionFooter(initialInputY, 1, 2)

      // Act: User deletes text, input shrinks to 1 line
      repositionFooter(initialInputY, 2, 1)

      // Assert: Footer should move back up to original position (prompt was erased)
      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


────────────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                               ? for shortcuts  `

      expect(terminal.getVisibleText()).toBe(expected)
    })

    test('should preserve footer content when repositioning', () => {
      // Arrange: Display with existing conversation
      const userMsg = new MessageCli('user', 'hello')
      const assistantMsg = new MessageCli('assistant', 'hi')
      state.chat.addMessage(userMsg)
      state.chat.addMessage(assistantMsg)

      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row

      // Act: Reposition footer
      repositionFooter(initialInputY, 1, 2)

      // Assert: Footer content (message count) should be preserved
      expect(terminal.contains('2 messages')).toBe(true)
      expect(terminal.contains('OpenAI · GPT-4')).toBe(true)
    })

    test('should handle edge case of no line count change', () => {
      // Arrange: Initial display
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row
      process.stdout.write('> ')

      // Act: Call repositionFooter with same line count (shouldn't happen in practice, but test defensiveness)
      repositionFooter(initialInputY, 1, 1)

      // Assert: Footer content preserved even though prompt erased (repositionFooter always erases/redraws)
      expect(terminal.contains('OpenAI · GPT-4')).toBe(true)
      expect(terminal.contains('────────────────')).toBe(true)
    })
  })

  describe('Requirement: Dynamic Footer Text Updates', () => {
    test('should update footer text during escape hint with 1-line input', () => {
      // Arrange: Initial display
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row
      process.stdout.write('> ')

      // Act: User presses escape once, footer text changes
      updateFooterRightText(initialInputY, 1, 'Press Escape again to clear')

      // Assert: Footer text updated, position unchanged (prompt was erased by updateFooterRightText)
      expect(terminal.contains('Press Escape again to clear')).toBe(true)
      expect(terminal.contains('OpenAI · GPT-4')).toBe(true)

      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


────────────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                   Press Escape again to clear  `

      expect(terminal.getVisibleText()).toBe(expected)
    })

    test('should update footer text with multi-line input', () => {
      // Arrange: Display with 2-line input
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row

      // Move footer for 2-line input
      repositionFooter(initialInputY, 1, 2)

      // Act: Update footer text for escape hint
      updateFooterRightText(initialInputY, 2, 'Press Escape again to clear')

      // Assert: Footer text updated at correct position (prompt was erased)
      expect(terminal.contains('Press Escape again to clear')).toBe(true)

      const expected = `
  ██  █  ██  Witsy CLI vdev
  ██ ███ ██  AI Assistant · Command Line Interface
   ███ ███   http://localhost:8090


────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────────
  OpenAI · GPT-4                                   Press Escape again to clear  `

      expect(terminal.getVisibleText()).toBe(expected)
    })

    test('should restore default footer text after escape timeout', () => {
      // Arrange: Footer showing escape hint
      state.chat.addMessage(new MessageCli('user', 'test'))
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row
      process.stdout.write('> ')

      // Show escape hint
      updateFooterRightText(initialInputY, 1, 'Press Escape again to clear')

      // Act: Timeout fires, restore default text
      updateFooterRightText(initialInputY, 1)  // No text param = use default

      // Assert: Default text restored (message count)
      expect(terminal.contains('1 messages')).toBe(true)
      expect(terminal.contains('Press Escape again to clear')).toBe(false)
    })
  })

  describe('Requirement: resetDisplay', () => {
    test('should redraw entire screen with header, conversation, and footer', () => {
      // Arrange: State with messages
      state.chat.addMessage(new MessageCli('user', 'hello'))
      state.chat.addMessage(new MessageCli('assistant', 'hi'))

      // Act
      resetDisplay()

      // Assert: Complete screen layout
      expect(terminal.contains('Witsy CLI')).toBe(true)
      expect(terminal.contains('> hello')).toBe(true)
      expect(terminal.contains('  hi')).toBe(true)
      expect(terminal.contains('OpenAI · GPT-4')).toBe(true)
      expect(terminal.contains('2 messages')).toBe(true)
    })

    test('should call optional beforeFooter callback', () => {
      // Arrange
      let callbackCalled = false
      const beforeFooter = () => {
        callbackCalled = true
        console.log('Custom content')
      }

      // Act
      resetDisplay(beforeFooter)

      // Assert
      expect(callbackCalled).toBe(true)
      expect(terminal.contains('Custom content')).toBe(true)
    })
  })

  describe('Requirement: clearFooter', () => {
    test('should erase footer from screen', () => {
      // Arrange: Display with footer
      displayHeader()
      displayConversation()
      displayFooter()
      process.stdout.write('> test')

      // Verify footer is there
      expect(terminal.contains('OpenAI · GPT-4')).toBe(true)

      // Act: Clear footer
      clearFooter()

      // Assert: Footer content erased
      expect(terminal.contains('OpenAI · GPT-4')).toBe(false)
    })
  })

  describe('Requirement: eraseLines', () => {
    test('should erase specified number of lines', () => {
      // Arrange: Write multiple lines
      console.log('line 1')
      console.log('line 2')
      console.log('line 3')

      // Act: Erase 2 lines
      eraseLines(2)

      // Assert: Lines erased
      expect(terminal.contains('line 2')).toBe(false)
      expect(terminal.contains('line 3')).toBe(false)
    })
  })

  describe('Requirement: displayCommandSuggestions', () => {
    test('should display command list with descriptions', () => {
      // Arrange: Commands to suggest
      const commands = [
        { name: '/help', description: 'Show help' },
        { name: '/exit', description: 'Exit CLI' }
      ]

      displayHeader()
      displayConversation()
      displayFooter()

      // Act
      const linesRendered = displayCommandSuggestions(commands, 0)

      // Assert: Commands displayed
      expect(terminal.contains('/help')).toBe(true)
      expect(terminal.contains('Show help')).toBe(true)
      expect(terminal.contains('/exit')).toBe(true)
      expect(terminal.contains('Exit CLI')).toBe(true)
      expect(linesRendered).toBe(3) // blank line + 2 commands
    })

    test('should highlight selected command', () => {
      // Arrange
      const commands = [
        { name: '/help', description: 'Show help' },
        { name: '/exit', description: 'Exit CLI' }
      ]

      displayHeader()
      displayConversation()
      displayFooter()

      // Act: Select second command
      displayCommandSuggestions(commands, 1)

      // Assert: Both commands displayed (highlighting is via ANSI codes)
      expect(terminal.contains('/help')).toBe(true)
      expect(terminal.contains('/exit')).toBe(true)
    })
  })

  describe('Requirement: displayConversation with edge cases', () => {
    test('should display empty conversation with just blank line', () => {
      // Arrange: Empty conversation
      state.chat.messages = []

      // Act
      displayHeader()
      displayConversation()

      // Assert: Just header and blank line, no messages
      const lines = terminal.getVisibleText().split('\n')
      expect(lines.length).toBeLessThan(10) // Header is ~5 lines
      expect(terminal.contains('>')).toBe(false)
    })

    test('should display long message that wraps', () => {
      // Arrange: Very long message
      const longMessage = 'a'.repeat(200)
      state.chat.addMessage(new MessageCli('user', longMessage))

      // Act
      displayHeader()
      displayConversation()

      // Assert: Message displayed (wrapping handled by terminal)
      expect(terminal.contains(longMessage.slice(0, 50))).toBe(true)
    })

    test('should display multiple exchanges correctly', () => {
      // Arrange: Multiple back-and-forth messages
      state.chat.addMessage(new MessageCli('user', 'first'))
      state.chat.addMessage(new MessageCli('assistant', 'response1'))
      state.chat.addMessage(new MessageCli('user', 'second'))
      state.chat.addMessage(new MessageCli('assistant', 'response2'))

      // Act
      displayHeader()
      displayConversation()

      // Assert: All messages present
      expect(terminal.contains('> first')).toBe(true)
      expect(terminal.contains('  response1')).toBe(true)
      expect(terminal.contains('> second')).toBe(true)
      expect(terminal.contains('  response2')).toBe(true)
    })
  })

  describe('Requirement: padContent word wrapping', () => {
    test('should add padding to short single line', () => {
      // Arrange
      const text = 'Hello world'

      // Act
      const result = padContent(text, 80)

      // Assert
      expect(result).toBe('  Hello world  ')
    })

    test('should preserve existing newlines', () => {
      // Arrange
      const text = 'Line 1\nLine 2\nLine 3'

      // Act
      const result = padContent(text, 80)

      // Assert
      expect(result).toBe('  Line 1  \n  Line 2  \n  Line 3  ')
    })

    test('should wrap long line at word boundaries', () => {
      // Arrange
      // Create a line that exceeds width-4 (76 chars for 80 col terminal)
      const text = 'This is a very long line that definitely exceeds the maximum width and should be wrapped at word boundaries'

      // Act
      const result = padContent(text, 80)

      // Assert - should be wrapped into multiple lines, each with padding
      const lines = result.split('\n')
      expect(lines.length).toBeGreaterThan(1)
      for (const line of lines) {
        expect(line.startsWith('  ')).toBe(true)
        expect(line.endsWith('  ')).toBe(true)
        // Each line should not exceed 80 chars
        expect(line.length).toBeLessThanOrEqual(80)
      }
    })

    test('should break very long words', () => {
      // Arrange
      // Create a word longer than maxLineWidth (76 chars for 80 col terminal)
      const longWord = 'a'.repeat(100)

      // Act
      const result = padContent(longWord, 80)

      // Assert - should be broken into chunks
      const lines = result.split('\n')
      expect(lines.length).toBeGreaterThan(1)
      for (const line of lines) {
        expect(line.startsWith('  ')).toBe(true)
        expect(line.endsWith('  ')).toBe(true)
        expect(line.length).toBeLessThanOrEqual(80)
      }
    })

    test('should handle empty string', () => {
      // Act
      const result = padContent('', 80)

      // Assert
      expect(result).toBe('    ')
    })

    test('should handle mixed long and short lines', () => {
      // Arrange
      const text = 'Short\nThis is a very long line that exceeds the maximum width and needs wrapping\nAnother short'

      // Act
      const result = padContent(text, 80)

      // Assert
      const lines = result.split('\n')
      expect(lines[0]).toBe('  Short  ')
      expect(lines[lines.length - 1]).toBe('  Another short  ')
      // Middle lines should be wrapped (at least 3 lines total: short + wrapped middle + short)
      expect(lines.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Requirement: Shortcut Help Display', () => {
    test('getDefaultFooterRightText should return "? for shortcuts" when no messages', () => {
      // Arrange: Empty chat
      state.chat.messages = []

      // Act
      const result = getDefaultFooterRightText()

      // Assert
      expect(result).toBe('? for shortcuts')
    })

    test('getDefaultFooterRightText should return message count when messages exist', () => {
      // Arrange: Chat with 2 messages
      state.chat.addMessage(new MessageCli('user', 'hello'))
      state.chat.addMessage(new MessageCli('assistant', 'hi'))

      // Act
      const result = getDefaultFooterRightText()

      // Assert
      expect(result).toBe('2 messages')
    })

    test('getDefaultFooterRightText should return empty string when no messages but input is not empty', () => {
      // Arrange: Empty chat with user typing
      state.chat.messages = []

      // Act
      const result = getDefaultFooterRightText('hello')

      // Assert
      expect(result).toBe('')
    })

    test('getDefaultFooterRightText should return "? for shortcuts" when no messages and input is empty', () => {
      // Arrange: Empty chat with no input
      state.chat.messages = []

      // Act
      const result = getDefaultFooterRightText('')

      // Assert
      expect(result).toBe('? for shortcuts')
    })

    test('getDefaultFooterRightText should return empty string when input contains only whitespace', () => {
      // Arrange: Empty chat with whitespace input
      state.chat.messages = []

      // Act
      const result = getDefaultFooterRightText('   ')

      // Assert
      expect(result).toBe('')
    })

    test('displayShortcutHelp should show help text in place of footer', () => {
      // Arrange: Initial display
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row

      // Act: Display help (replaces footer text)
      displayShortcutHelp(initialInputY, 1)

      // Assert: Help text displayed
      expect(terminal.contains('/ for commands')).toBe(true)
      expect(terminal.contains('double tap esc to clear input')).toBe(true)
      expect(terminal.contains('shift + ⏎ for newline')).toBe(true)
    })

    test('displayShortcutHelp should use 3-column layout', () => {
      // Arrange: Initial display
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row

      // Act
      displayShortcutHelp(initialInputY, 1)

      // Assert: Check spacing indicates columns (each item padded to column width)
      const text = terminal.getVisibleText()
      expect(text).toContain('/ for commands')
      expect(text).toContain('double tap esc to clear input')
      expect(text).toContain('shift + ⏎ for newline')

      // Column 1 and 2 should be on first row
      const lines = text.split('\n')
      const helpLine1 = lines.find(l => l.includes('/ for commands'))
      expect(helpLine1).toBeDefined()
      expect(helpLine1).toContain('double tap esc to clear input')
    })

    test('clearShortcutHelp should restore normal footer text', () => {
      // Arrange: Display help first
      state.chat.addMessage(new MessageCli('user', 'test'))
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row

      displayShortcutHelp(initialInputY, 1)
      expect(terminal.contains('/ for commands')).toBe(true)

      // Act: Clear help
      clearShortcutHelp(initialInputY, 1)

      // Assert: Normal footer restored
      expect(terminal.contains('/ for commands')).toBe(false)
      expect(terminal.contains('OpenAI · GPT-4')).toBe(true)
      expect(terminal.contains('1 messages')).toBe(true)
    })

    test('clearShortcutHelp should work with multi-line input', () => {
      // Arrange: Display with 2-line input
      displayHeader()
      displayConversation()
      displayFooter()
      const initialInputY = terminal.getCursorPosition().row

      repositionFooter(initialInputY, 1, 2)
      displayShortcutHelp(initialInputY, 2)

      // Act: Clear help
      clearShortcutHelp(initialInputY, 2)

      // Assert: Normal footer restored at correct position
      expect(terminal.contains('/ for commands')).toBe(false)
      expect(terminal.contains('OpenAI · GPT-4')).toBe(true)
    })
  })
})
