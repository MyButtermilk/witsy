import { App } from 'electron'
import AgentWorkflowExecutor from '../services/agent_executor_workflow'
import AgentA2AExecutor from '../services/agent_executor_a2a'
import { Agent, AgentRun, AgentRunTrigger } from '../types/index'
import { loadAgents } from './agents'
import { LlmContext } from './llm_utils'
import Mcp from './mcp'
import { listWorkspaces } from './workspace'

/**
 * Generate a unique 8-character alphanumeric webhook token for an agent
 * Ensures uniqueness across all agents in all workspaces
 */
export function generateWebhookToken(app: App, workspaceId: string, agentId: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const maxAttempts = 1000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate 8 random characters
    let token = ''
    for (let i = 0; i < 8; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    // Check if token is unique across all workspaces
    let isUnique = true
    const workspaces = listWorkspaces(app)

    for (const workspace of workspaces) {
      const agents = loadAgents(app, workspace.uuid)
      for (const agent of agents) {
        // Skip the agent we're generating for
        if (workspace.uuid === workspaceId && agent.uuid === agentId) {
          continue
        }
        if (agent.webhookToken === token) {
          isUnique = false
          break
        }
      }
      if (!isUnique) break
    }

    // If unique return
    if (isUnique) {
      return token
    }
  }

  throw new Error('Failed to generate unique webhook token after maximum attempts')
}

/**
 * Find an agent by its webhook token across all workspaces
 */
export function findAgentByWebhookToken(app: App, token: string): { agent: Agent, workspaceId: string } | null {
  const workspaces = listWorkspaces(app)

  for (const workspace of workspaces) {
    const agents = loadAgents(app, workspace.uuid)
    const agent = agents.find(a => a.webhookToken === token)

    if (agent) {
      return { agent, workspaceId: workspace.uuid }
    }
  }

  return null
}

export class AgentExecutor extends LlmContext {

  constructor(app: App, mcp: Mcp) {
    super(app, mcp)
  }

  public async runAgent(
    workspaceId: string,
    agent: Agent,
    trigger: AgentRunTrigger,
    prompt: string,
    runId?: string
  ): Promise<AgentRun> {

    // Initialize LLM context (global mock + i18n)
    const config = this.initializeContext()

    // Select executor based on agent type
    const executor = agent.source === 'a2a'
      ? new AgentA2AExecutor(config, workspaceId, agent)
      : new AgentWorkflowExecutor(config, workspaceId, agent)
    return await executor.run(trigger, prompt, { runId, model: agent.model } )
  }

}

