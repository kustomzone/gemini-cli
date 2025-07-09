/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandContext } from './types.js';
import {
  Config,
  BackgroundAgentTask,
  partListUnionToString,
} from '@google/gemini-cli-core';

const MAX_STATUS_MESSAGE_LENGTH = 100;

function getTaskStatusString(task: BackgroundAgentTask): string {
  return partListUnionToString(task.status.message?.parts ?? []).trim();
}

function getActiveAgent(context: CommandContext) {
  const agent =
    context.services.config?.getBackgroundAgentManager()?.activeAgent;
  if (!agent) {
    throw Error('There is no active background agent.');
  }
  return agent;
}

function addClientHistory(context: CommandContext, text: string) {
  context.services.config!.getGeminiClient().addHistory({
    role: 'user',
    parts: [{ text }],
  });

  context.services.config!.getGeminiClient().addHistory({
    role: 'model',
    parts: [{ text: 'Got it.' }],
  });
}

const startSubcommand: SlashCommand = {
  name: 'start',
  description: 'Start a new task with the provided prompt',
  action: async (context, args) => {
    if (!args || args.trim() === '') {
      return {
        type: 'message',
        messageType: 'error',
        content: 'The `start` command requires a prompt.',
      };
    }

    const id = await getActiveAgent(context).startTask(args);

    addClientHistory(
      context,
      `I started a background task with id '${id}' and prompt:\n${args}`,
    );

    return {
      type: 'message',
      messageType: 'info',
      content: `Started background task with id '${id}' and prompt:\n${args}`,
    };
  },
};

const stopSubcommand: SlashCommand = {
  name: 'stop',
  description: 'Stops a running task',
  action: async (context, args) => {
    if (!args || args.trim() === '') {
      return {
        type: 'message',
        messageType: 'error',
        content: 'The `stop` command requires a task id.',
      };
    }
    await getActiveAgent(context).cancelTask(args);
    addClientHistory(context, `I canceled the background task with id ${args}`);
    return {
      type: 'message',
      messageType: 'info',
      content: `Stopped background task with id ${args}.`,
    };
  },
};

const listSubcommand: SlashCommand = {
  name: 'list',
  description: 'List all tasks',
  action: async (context, args) => {
    if (args && args.trim() !== '') {
      return {
        type: 'message',
        messageType: 'error',
        content: 'The `list` command takes no arguments.',
      };
    }

    const tasks = await getActiveAgent(context).listTasks();
    let content: string;
    if (tasks.length === 0) {
      content = 'No background tasks found.';
    } else {
      const taskList = tasks
        .map((task) => {
          let statusMessage = getTaskStatusString(task).replace(
            /\r?\n|\r/g,
            ' ',
          );
          if (statusMessage.length > MAX_STATUS_MESSAGE_LENGTH) {
            statusMessage =
              statusMessage.substring(0, MAX_STATUS_MESSAGE_LENGTH) + '...';
          }
          return `  - ${task.id}: (${task.status.state}) ${statusMessage}`;
        })
        .join('\n');
      content = `Background tasks:\n${taskList}`;
    }
    return {
      type: 'message',
      messageType: 'info',
      content,
    };
  },
};

const getSubcommand: SlashCommand = {
  name: 'get',
  description: 'View a task',
  action: async (context, args) => {
    if (!args || args.trim() === '') {
      return {
        type: 'message',
        messageType: 'error',
        content: 'The `get` command requires a task id.',
      };
    }
    const task = await getActiveAgent(context).getTask(args);
    const content = `Task Details for ${task.id}:
Status: (${task.status.state}) ${getTaskStatusString(task)}}`;

    return {
      type: 'message',
      messageType: 'info',
      content,
    };
  },
};

const logsSubcommand: SlashCommand = {
  name: 'logs',
  description: "View a task's recent logs",
  action: async (context, args) => {
    if (!args || args.trim() === '') {
      return {
        type: 'message',
        messageType: 'error',
        content: 'The `log` command requires a task id.',
      };
    }
    const task = await getActiveAgent(context).getTask(args);
    const content = `Task logs for ${task.id}. status: (${task.status.state})\n${partListUnionToString(
      task.status.message?.parts ?? [],
    )}`;

    return {
      type: 'message',
      messageType: 'info',
      content,
    };
  },
};

const messageSubcommand: SlashCommand = {
  name: 'message',
  description: 'Send a message to a task',
  action: async (context, args) => {
    if (!args || args.trim() === '' || !args.trim().includes(' ')) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'The `message` command requires a task id and a message.',
      };
    }

    const firstSpaceIndex = args.indexOf(' ');
    const id = args.substring(0, firstSpaceIndex);
    const message = args.substring(firstSpaceIndex + 1);

    await getActiveAgent(context).messageTask(id, message);
    addClientHistory(
      context,
      `I sent a message to the background task with id '${id}':\n${message}`,
    );

    return {
      type: 'message',
      messageType: 'info',
      content: `Sent a message to the background task with id '${id}':\n${message}`,
    };
  },
};

const deleteSubcommand: SlashCommand = {
  name: 'delete',
  description: 'Deletes a task.',
  action: async (context, args) => {
    if (!args) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'The `delete` command requires a task id.',
      };
    }
    await getActiveAgent(context).deleteTask(args);
    addClientHistory(context, `I deleted the background task with id ${args}`);
    return {
      type: 'message',
      messageType: 'info',
      content: `Task ${args} deleted.`,
    };
  },
};

export const backgroundCommand = (config: Config | null): SlashCommand | null => {
  if (!config?.getBackgroundAgentManager()) {
    return null;
  }
  return {
    name: 'background',
    altName: 'bg',
    description: "Commands for managing the background agent's tasks",
    subCommands: [
      startSubcommand,
      stopSubcommand,
      listSubcommand,
      getSubcommand,
      logsSubcommand,
      messageSubcommand,
      deleteSubcommand,
    ],
  }
};
