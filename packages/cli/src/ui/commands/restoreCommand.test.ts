/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { restoreCommand } from './restoreCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { Config } from '@google/gemini-cli-core';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe('restoreCommand', () => {
  let context: ReturnType<typeof createMockCommandContext>;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    context = createMockCommandContext();
    mockConfig = {
      getCheckpointingEnabled: vi.fn(() => true),
      getProjectTempDir: vi.fn(() => '/test/dir/.gemini'),
      getGeminiClient: vi.fn(() => ({
        setHistory: vi.fn().mockResolvedValue(undefined),
      })),
    } as unknown as Config;
    context.services.config = mockConfig;
  });

  it('should be null if checkpointing is disabled', () => {
    (mockConfig.getCheckpointingEnabled as vi.Mock).mockReturnValue(false);
    const command = restoreCommand(mockConfig);
    expect(command).toBeNull();
  });

  it('should be defined if checkpointing is enabled', () => {
    const command = restoreCommand(mockConfig);
    expect(command).not.toBeNull();
    expect(command?.name).toBe('restore');
  });

  describe('action', () => {
    it('should show "no restorable calls" message if no checkpoints exist', async () => {
      (fs.readdir as vi.Mock).mockResolvedValue([]);
      const command = restoreCommand(mockConfig);
      const result = await command!.action!(context, '');
      expect(fs.mkdir).toHaveBeenCalledWith('/test/dir/.gemini/checkpoints', {
        recursive: true,
      });
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No restorable tool calls found.',
      });
    });

    it('should list available checkpoints if no argument is provided', async () => {
      (fs.readdir as vi.Mock).mockResolvedValue([
        'checkpoint1.json',
        'checkpoint2.json',
      ]);
      const command = restoreCommand(mockConfig);
      const result = await command!.action!(context, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Available tool calls to restore:\n\ncheckpoint1\ncheckpoint2',
      });
    });

    it('should return an error if the specified checkpoint is not found', async () => {
      (fs.readdir as vi.Mock).mockResolvedValue(['checkpoint1.json']);
      const command = restoreCommand(mockConfig);
      const result = await command!.action!(context, 'nonexistent');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'File not found: nonexistent.json',
      });
    });

    it('should restore history, client history, and git state, then return a tool call', async () => {
      const checkpointName = 'my-checkpoint';
      const toolCallData = {
        history: [{ type: 'user', text: 'previous prompt' }],
        clientHistory: [{ role: 'user', parts: [{ text: 'client history' }] }],
        commitHash: 'abcdef123',
        toolCall: { name: 'test_tool', args: { foo: 'bar' } },
      };
      (fs.readdir as vi.Mock).mockResolvedValue([`${checkpointName}.json`]);
      (fs.readFile as vi.Mock).mockResolvedValue(JSON.stringify(toolCallData));

      const command = restoreCommand(mockConfig);
      const result = await command!.action!(context, checkpointName);

      expect(context.ui.loadHistory).toHaveBeenCalledWith(toolCallData.history);
      expect(
        context.services.config?.getGeminiClient()?.setHistory,
      ).toHaveBeenCalledWith(toolCallData.clientHistory);
      expect(
        context.services.git?.restoreProjectFromSnapshot,
      ).toHaveBeenCalledWith(toolCallData.commitHash);
      expect(context.ui.addItem).toHaveBeenCalledWith(
        {
          type: 'info',
          text: 'Restored project to the state before the tool call.',
        },
        expect.any(Number),
      );
      expect(result).toEqual({
        type: 'tool',
        toolName: 'test_tool',
        toolArgs: { foo: 'bar' },
      });
    });

    it('should handle errors during file operations', async () => {
      const error = new Error('Read failed');
      (fs.readdir as vi.Mock).mockRejectedValue(error);
      const command = restoreCommand(mockConfig);
      const result = await command!.action!(context, 'any');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `Could not read restorable tool calls. This is the error: ${error}`,
      });
    });
  });

  describe('completion', () => {
    it('should return a list of available checkpoint names', async () => {
      (fs.readdir as vi.Mock).mockResolvedValue([
        'cp1.json',
        'cp2.json',
        'not-a-checkpoint.txt',
      ]);
      const command = restoreCommand(mockConfig);
      const completions = await command!.completion!(context, '');
      expect(completions).toEqual(['cp1', 'cp2']);
    });

    it('should return an empty array if reading the directory fails', async () => {
      (fs.readdir as vi.Mock).mockRejectedValue(new Error('Failed to read'));
      const command = restoreCommand(mockConfig);
      const completions = await command!.completion!(context, '');
      expect(completions).toEqual([]);
    });
  });
});
