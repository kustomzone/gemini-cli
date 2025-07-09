/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Part } from '@google/genai';

export type BackgroundAgentError = {
  error: string;
};

export type BackgroundAgentMessage = {
  role: 'user' | 'agent';
  parts: Part[];
};

export type BackgroundAgentTaskStatus = {
  state: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed';
  message?: BackgroundAgentMessage;
};

export type BackgroundAgentTask = {
  id: string;
  status: BackgroundAgentTaskStatus;
  history?: BackgroundAgentMessage[];
};
