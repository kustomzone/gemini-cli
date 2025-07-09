/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { Part } from '@google/genai';


type BackgroundAgentError = {
  error: string;
};

type BackgroundAgentMessage = {
  role: 'user' | 'agent';
  parts: Part[];
};

type BackgroundAgentTaskStatus = {
  state: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed';
  message?: BackgroundAgentMessage;
};

type BackgroundAgentTask = {
  id: string;
  status: BackgroundAgentTaskStatus;
  history?: BackgroundAgentMessage[];
};

const server = new McpServer({
  name: 'addition-server',
  version: '1.0.0',
});

const nameToTask = new Map<string, BackgroundAgentTask>();


server.tool(
  'startTask',
  'Launches a new task asynchronously.',
  { prompt: z.string() },
  async ({ prompt}) => {
    return ({
      content: [{ type: 'text', text: prompt }],
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);