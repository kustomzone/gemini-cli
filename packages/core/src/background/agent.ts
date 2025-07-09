/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from '../config/config.js';
import { connectToMcpServer, discoverTools } from '../tools/mcp-client.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { BackgroundAgentTask } from './types.js';

export async function loadBackgroundAgent(
  name: string,
  config: MCPServerConfig,
  debugMode: boolean,
): Promise<BackgroundAgent> {
  const server = await connectToMcpServer(name, config, debugMode);
  try {
    const tools = await discoverTools(name, config, server);
    return new BackgroundAgent(name, tools);
  } catch (error) {
    await server.close();
    throw error;
  }
}

export class BackgroundAgent {
  readonly startTaskTool: DiscoveredMCPTool;
  readonly getTaskTool: DiscoveredMCPTool;
  readonly listTaskTool: DiscoveredMCPTool;
  readonly messageTaskTool: DiscoveredMCPTool;
  readonly deleteTaskTool: DiscoveredMCPTool;
  readonly cancelTaskTool: DiscoveredMCPTool;

  constructor(
    readonly serverName: string,
    tools: DiscoveredMCPTool[],
  ) {
    const getToolOrFail = (name: string): DiscoveredMCPTool => {
      for (const tool of tools) {
        if (tool.serverToolName === name) {
          return tool;
        }
      }
      throw new Error(`missing expected tool: ${name}`);
    };

    this.startTaskTool = getToolOrFail('startTask');
    this.getTaskTool = getToolOrFail('getTask');
    this.listTaskTool = getToolOrFail('listTask');
    this.messageTaskTool = getToolOrFail('messageTask');
    this.deleteTaskTool = getToolOrFail('deleteTask');
    this.cancelTaskTool = getToolOrFail('cancelTask');
  }

  async startTask(prompt: string): Promise<string> {
    const out = await this.callTool(this.startTaskTool, {
      prompt: {
        role: 'user',
        parts: [{ text: prompt }],
      },
    });
    if (!('id' in out) || typeof out['id'] !== 'string') {
      throw new Error(
        "startTask resp does not contain field 'id' of type string",
      );
    }
    return out['id'];
  }

  async getTask(
    id: string,
    historyLength?: number,
  ): Promise<BackgroundAgentTask> {
    const out = await this.callTool(this.getTaskTool, { id, historyLength });
    return out as BackgroundAgentTask;
  }

  async listTasks(): Promise<BackgroundAgentTask[]> {
    const out = await this.callTool(this.listTaskTool, {});
    if (!('tasks' in out)) {
      throw new Error("listTask resp does not contain field 'tasks'");
    }
    return out['tasks'] as BackgroundAgentTask[];
  }

  async messageTask(id: string, message: string) {
    await this.callTool(this.messageTaskTool, {
      id,
      message: {
        role: 'user',
        parts: [{ text: message }],
      },
    });
  }

  async deleteTask(id: string) {
    await this.callTool(this.deleteTaskTool, { id });
  }

  async cancelTask(id: string) {
    await this.callTool(this.cancelTaskTool, { id });
  }

  private async callTool(
    tool: DiscoveredMCPTool,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const parts = await tool.mcpCall(params);
    if (
      parts.length !== 1 ||
      parts[0]?.functionResponse?.response === undefined
    ) {
      throw new Error('Expected exactly one part with a functionResponse');
    }
    const resp = parts[0].functionResponse.response;
    if ('error' in resp) {
      throw new Error(`Error calling ${tool.displayName}: ${resp.error}`);
    }
    return parts[0].functionResponse.response;
  }
}
