import { beforeEach, describe, expect, test, vi, afterEach } from 'vitest'
import { App } from 'electron'
import Scheduler from '../../src/main/scheduler'
import Mcp from '../../src/main/mcp'
import Agent from '../../src/models/agent'
import * as configModule from '../../src/main/config'
import * as agentsModule from '../../src/main/agents'
import * as interpreterModule from '../../src/main/interpreter'
import * as workspaceModule from '../../src/main/workspace'
import * as i18nModule from '../../src/services/i18n'
import * as mainI18nModule from '../../src/main/i18n'
import { WorkspaceHeader } from '../../src/types/workspace'

// Mock external dependencies
vi.mock('cron-parser')
vi.mock('../../src/main/config')
vi.mock('../../src/main/agents')
vi.mock('../../src/main/agent_utils')
vi.mock('../../src/main/interpreter')
vi.mock('../../src/main/i18n')
vi.mock('../../src/main/search')
vi.mock('../../src/main/workspace')
vi.mock('../../src/services/runner')
vi.mock('../../src/services/i18n')

// Mock CronExpressionParser
const mockCronParser = {
  parse: vi.fn(),
  next: vi.fn()
}

vi.mocked(await import('cron-parser')).CronExpressionParser = mockCronParser as any

vi.mock('fs')

describe('Scheduler', () => {
  let scheduler: Scheduler
  let mockApp: App
  let mockMcp: Mcp
  let mockConfig: any
  let mockAgents: Agent[]
  let originalConsoleLog: any
  let originalSetTimeout: any
  let originalClearInterval: any

  // Helper function to create a mock agent
  const createMockAgent = (overrides: Partial<Agent> = {}): Agent => {
    const agent = new Agent()
    Object.assign(agent, {
      uuid: 'test-agent-' + Math.random(),
      name: 'Test Agent',
      locale: 'en-US',
      schedule: null,
      invocationValues: {},
      buildPrompt: vi.fn(),
      ...overrides
    })
    return agent
  }

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Mock console.log to avoid noise in tests
    originalConsoleLog = console.log
    console.log = vi.fn()

    // Mock setTimeout and clearInterval
    originalSetTimeout = global.setTimeout
    originalClearInterval = global.clearInterval
    global.setTimeout = vi.fn((fn) => {
      if (typeof fn === 'function') fn()
      return 'timeout-id' as any
    }) as any
    global.clearInterval = vi.fn()

    // Create mock app
    mockApp = {
      getPath: vi.fn(() => '/mock/path'),
      getName: vi.fn(() => 'witsy'),
      getVersion: vi.fn(() => '1.0.0')
    } as any

    // Create mock MCP
    mockMcp = {
      getLlmTools: vi.fn(() => []),
      callTool: vi.fn(),
      isAvailable: vi.fn(() => true)
    } as any

    // Setup default config mock
    mockConfig = {
      features: {
        agents: true
      },
      general: {
        locale: 'en-US'
      },
      llm: {
        locale: 'en-US'
      }
    }

    // Setup default agents mock
    mockAgents = []

    // Mock module functions
    vi.mocked(configModule.loadSettings).mockReturnValue(mockConfig)
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)
    vi.mocked(agentsModule.saveAgentRun).mockReturnValue(true)
    vi.mocked(interpreterModule.runPython).mockResolvedValue('python result')
    vi.mocked(workspaceModule.listWorkspaces).mockReturnValue([{uuid: '123'} as WorkspaceHeader])
    vi.mocked(i18nModule.initI18n).mockReturnValue(undefined)
    vi.mocked(mainI18nModule.getLocaleMessages).mockReturnValue({})

    // Create scheduler instance
    scheduler = new Scheduler(mockApp, mockMcp)

    // Mock runAgent method on the scheduler instance
    vi.spyOn(scheduler, 'runAgent').mockResolvedValue({
      uuid: 'run-1',
      agentId: 'agent-1',
      status: 'success'
    } as any)

    // Mock start method to prevent infinite loops in tests
    vi.spyOn(scheduler, 'start').mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Restore original functions
    console.log = originalConsoleLog
    global.setTimeout = originalSetTimeout
    global.clearInterval = originalClearInterval
    
    // Stop scheduler to clean up
    scheduler.stop()

    // Clean up global window mock
    delete (global as any).window
  })

  test('Constructor initializes correctly', () => {
    expect(scheduler).toBeInstanceOf(Scheduler)
    expect(scheduler.timeout).toBe(null)
  })


  test('stop() clears timeout', () => {
    scheduler.timeout = 'some-timeout' as any
    scheduler.stop()
    
    expect(global.clearInterval).toHaveBeenCalledWith('some-timeout')
    expect(scheduler.timeout).toBe(null)
  })

  test('start() calculates delay and calls check', async () => {
    // Remove the global start mock for this test
    vi.mocked(scheduler.start).mockRestore()
    
    vi.spyOn(Date.prototype, 'getSeconds').mockReturnValue(45)
    vi.spyOn(Date.prototype, 'getMilliseconds').mockReturnValue(500)
    
    // Mock check method to prevent recursive calls
    const checkSpy = vi.spyOn(scheduler, 'check').mockResolvedValue(undefined)
    
    await scheduler.start()

    // Should wait for (60 - 45) * 1000 - 500 = 14500ms
    expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 14500)
    expect(checkSpy).toHaveBeenCalled()
  })

  test('check() skips agents without schedule', async () => {
    const agent1 = createMockAgent({
      uuid: 'agent1',
      name: 'Test Agent 1',
      schedule: null
    })

    const agent2 = createMockAgent({
      uuid: 'agent2',
      name: 'Test Agent 2',
      schedule: '0 * * * *'
    })

    mockAgents = [agent1, agent2]
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)

    // Mock cron parser to return a time that's not due
    const mockInterval = {
      next: () => ({ getTime: () => Date.now() + 60000 }) // 1 minute in future
    }
    mockCronParser.parse.mockReturnValue(mockInterval)

    await scheduler.check()

    expect(agent1.buildPrompt).not.toHaveBeenCalled()
    expect(mockCronParser.parse).toHaveBeenCalledWith('0 * * * *', expect.any(Object))
  })

  test('check() runs agent when schedule is due', async () => {
    const mockPrompt = 'Generated prompt for scheduled run'
    const agent = createMockAgent({
      uuid: 'scheduled-agent',
      name: 'Scheduled Agent',
      schedule: '0 * * * *',
      invocationValues: { param1: 'value1' },
      buildPrompt: vi.fn().mockReturnValue(mockPrompt)
    })

    mockAgents = [agent]
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)

    // Mock cron parser to return current time (schedule is due)
    const now = Date.now()
    const mockInterval = {
      next: () => ({ getTime: () => now + 1000 }) // Just 1 second difference (within tolerance)
    }
    mockCronParser.parse.mockReturnValue(mockInterval)

    // Mock Date.now to return consistent time
    vi.spyOn(Date, 'now').mockReturnValue(now)

    await scheduler.check()

    expect(agent.buildPrompt).toHaveBeenCalledWith(0, { param1: 'value1' })
    expect(scheduler.runAgent).toHaveBeenCalledWith('123', agent, 'schedule', mockPrompt)
  })

  test('check() handles agent execution errors gracefully', async () => {
    const agent = createMockAgent({
      uuid: 'error-agent',
      name: 'Error Agent',
      schedule: '0 * * * *',
      invocationValues: {},
      buildPrompt: vi.fn().mockImplementation(() => {
        throw new Error('Build prompt error')
      })
    })

    mockAgents = [agent]
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)

    // Mock cron parser to return current time (schedule is due)
    const now = Date.now()
    const mockInterval = {
      next: () => ({ getTime: () => now + 1000 })
    }
    mockCronParser.parse.mockReturnValue(mockInterval)
    vi.spyOn(Date, 'now').mockReturnValue(now)

    await scheduler.check()

    expect(console.log).toHaveBeenCalledWith('Error running agent Error Agent', expect.any(Error))
    expect(scheduler.runAgent).not.toHaveBeenCalled()
  })

  test('check() handles cron parsing errors gracefully', async () => {
    const agent = createMockAgent({
      uuid: 'invalid-cron-agent',
      name: 'Invalid Cron Agent',
      schedule: 'invalid cron'
    })

    mockAgents = [agent]
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)

    // Mock cron parser to throw error
    mockCronParser.parse.mockImplementation(() => {
      throw new Error('Invalid cron expression')
    })

    await scheduler.check()

    expect(console.log).toHaveBeenCalledWith('Error checking schedule for Invalid Cron Agent', expect.any(Error))
    expect(agent.buildPrompt).not.toHaveBeenCalled()
  })

  test('check() uses tolerance correctly for schedule detection', async () => {
    const agent = createMockAgent({
      uuid: 'tolerance-agent',
      name: 'Tolerance Agent',
      schedule: '0 * * * *',
      invocationValues: {},
      buildPrompt: vi.fn().mockReturnValue('test prompt')
    })

    mockAgents = [agent]
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)

    const now = Date.now()
    const tolerance = 30 * 1000 // 30 seconds

    // Mock cron parser to return time within tolerance (should be due)
    const mockInterval = {
      next: () => ({ getTime: () => now + tolerance - 1000 }) // 1 second within tolerance
    }
    mockCronParser.parse.mockReturnValue(mockInterval)
    vi.spyOn(Date, 'now').mockReturnValue(now)

    await scheduler.check()

    expect(mockCronParser.parse).toHaveBeenCalledWith('0 * * * *', { 
      currentDate: now - tolerance 
    })
    // Math.abs((now + tolerance - 1000) - now) = tolerance - 1000 < tolerance, so should be due
    expect(agent.buildPrompt).toHaveBeenCalled()
  })

  test('check() does not run agent when schedule is not due', async () => {
    const agent = createMockAgent({
      uuid: 'not-due-agent',
      name: 'Not Due Agent',
      schedule: '0 * * * *'
    })

    mockAgents = [agent]
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)

    const now = Date.now()
    const tolerance = 30 * 1000

    // Mock cron parser to return time outside tolerance
    const mockInterval = {
      next: () => ({ getTime: () => now + tolerance + 1000 }) // Outside tolerance
    }
    mockCronParser.parse.mockReturnValue(mockInterval)
    vi.spyOn(Date, 'now').mockReturnValue(now)

    await scheduler.check()

    expect(agent.buildPrompt).not.toHaveBeenCalled()
    expect(scheduler.runAgent).not.toHaveBeenCalled()
  })

  test('check() processes multiple agents correctly', async () => {
    const agent1 = createMockAgent({
      uuid: 'agent1',
      name: 'Agent 1',
      schedule: '0 * * * *',
      invocationValues: {},
      buildPrompt: vi.fn().mockReturnValue('prompt 1')
    })

    const agent2 = createMockAgent({
      uuid: 'agent2',
      name: 'Agent 2',
      schedule: '30 * * * *',
      invocationValues: {},
      buildPrompt: vi.fn().mockReturnValue('prompt 2')
    })

    const agent3 = createMockAgent({
      uuid: 'agent3',
      name: 'Agent 3',
      schedule: null // No schedule
    })

    mockAgents = [agent1, agent2, agent3]
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)

    const now = Date.now()

    // Mock cron parser to return different results for each agent
    mockCronParser.parse
      .mockReturnValueOnce({ next: () => ({ getTime: () => now + 1000 }) }) // agent1 - due
      .mockReturnValueOnce({ next: () => ({ getTime: () => now + 60000 }) }) // agent2 - not due

    vi.spyOn(Date, 'now').mockReturnValue(now)

    await scheduler.check()

    expect(agent1.buildPrompt).toHaveBeenCalled()
    expect(agent2.buildPrompt).not.toHaveBeenCalled()
    expect(agent3.buildPrompt).not.toHaveBeenCalled()
    expect(scheduler.runAgent).toHaveBeenCalledTimes(1)
  })

  test('check() reschedules itself after processing', async () => {
    // Mock start method to track calls
    const startSpy = vi.spyOn(scheduler, 'start').mockResolvedValue(undefined)

    await scheduler.check()

    expect(startSpy).toHaveBeenCalled()
  })


  test('Complex scenario - full scheduling workflow', async () => {
    // Setup multiple agents with different schedules
    const scheduledAgent = createMockAgent({
      uuid: 'scheduled-1',
      name: 'Daily Report Agent',
      schedule: '0 9 * * *', // 9 AM daily
      invocationValues: { format: 'pdf' },
      buildPrompt: vi.fn().mockReturnValue('Generate daily report in pdf format')
    })

    const nonScheduledAgent = createMockAgent({
      uuid: 'manual-1',
      name: 'Manual Agent',
      schedule: null
    })

    mockAgents = [scheduledAgent, nonScheduledAgent]
    vi.mocked(agentsModule.loadAgents).mockReturnValue(mockAgents)

    // Simulate it's 9:00:15 AM (15 seconds past due - within tolerance)
    const now = new Date('2024-01-01T09:00:15.000Z').getTime()
    const scheduledTime = new Date('2024-01-01T09:00:00.000Z').getTime()
    
    const mockInterval = {
      next: () => ({ getTime: () => scheduledTime })
    }
    mockCronParser.parse.mockReturnValue(mockInterval)
    vi.spyOn(Date, 'now').mockReturnValue(now)

    // Call check directly instead of start to test the scheduling logic
    await scheduler.check()

    // Verify the scheduled agent was processed
    expect(scheduledAgent.buildPrompt).toHaveBeenCalledWith(0, { format: 'pdf' })
    expect(nonScheduledAgent.buildPrompt).not.toHaveBeenCalled()

    // Verify runAgent was called
    expect(scheduler.runAgent).toHaveBeenCalledWith('123', scheduledAgent, 'schedule', 'Generate daily report in pdf format')

    // Verify console logging
    expect(console.log).toHaveBeenCalledWith('Agent Daily Report Agent is due to run')
  })
})
