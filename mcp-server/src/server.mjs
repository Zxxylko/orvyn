#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serverDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(serverDirectory, '../.env'), quiet: true });

const API_BASE_URL = normalizeBaseUrl(process.env.ORVYN_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1');
const API_TOKEN = process.env.ORVYN_API_TOKEN?.trim();
const API_TIMEOUT_MS = normalizeTimeout(process.env.ORVYN_API_TIMEOUT_MS);

const server = new McpServer({
  name: 'orvyn',
  version: '0.2.0',
});

function requireToken() {
  if (!API_TOKEN || API_TOKEN === 'your_sanctum_token_here') {
    throw new Error('Missing ORVYN_API_TOKEN. Create one with `php artisan orvyn:issue-agent-token <user-email>`, then expose it as ORVYN_API_TOKEN.');
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('ORVYN_API_BASE_URL must use http or https.');
  }

  return url.toString().replace(/\/$/, '');
}

function normalizeTimeout(value) {
  const timeout = Number(value ?? 30_000);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new Error('ORVYN_API_TIMEOUT_MS must be an integer between 1000 and 120000.');
  }

  return timeout;
}

async function request(path, options = {}) {
  requireToken();

  const url = new URL(`${API_BASE_URL}${path}`);
  const params = options.params ?? {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`,
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  const text = await response.text();
  const payload = text ? parseJson(text) : null;

  if (!response.ok) {
    const message = payload?.message ?? response.statusText;
    throw new Error(`ORVYN API ${response.status}: ${message}`);
  }

  return payload;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function jsonContent(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

server.registerTool(
  'orvyn_get_me',
  {
    title: 'Get Current ORVYN User',
    description: 'Return the authenticated ORVYN user for the configured Sanctum token.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => jsonContent(await request('/user/me'))
);

server.registerTool(
  'orvyn_list_tasks',
  {
    title: 'List ORVYN Tasks',
    description: 'List tasks, optionally filtered by status, active state, or overdue state.',
    inputSchema: {
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
      active: z.boolean().optional(),
      overdue: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ status, active, overdue }) => jsonContent(await request('/tasks', { params: { status, active, overdue } }))
);

server.registerTool(
  'orvyn_create_smart_task',
  {
    title: 'Create Smart ORVYN Task',
    description: 'Create a task using ORVYN natural-language parsing.',
    inputSchema: {
      input: z.string().min(1).max(500).describe('Example: OS lab due Friday high priority 3 hours'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ input }) => jsonContent(await request('/tasks/smart-parse', { method: 'POST', body: { input } }))
);

server.registerTool(
  'orvyn_update_task_status',
  {
    title: 'Update ORVYN Task Status',
    description: 'Move a task between pending, in progress, completed, and cancelled.',
    inputSchema: {
      id: z.string().min(1),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ id, status }) => jsonContent(await request(`/tasks/${encodeURIComponent(id)}`, { method: 'PUT', body: { status } }))
);

server.registerTool(
  'orvyn_get_analytics_snapshot',
  {
    title: 'Get ORVYN Analytics Snapshot',
    description: 'Return burnout, flow, streak, focus, and task analytics for the current user.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => jsonContent(await request('/analytics/snapshot'))
);

server.registerTool(
  'orvyn_get_today_briefing',
  {
    title: 'Get Today ORVYN Briefing',
    description: 'Return today’s AI briefing if one exists.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => jsonContent(await request('/briefing/today'))
);

server.registerTool(
  'orvyn_generate_briefing',
  {
    title: 'Generate ORVYN Briefing',
    description: 'Generate or refresh the daily AI briefing.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async () => jsonContent(await request('/briefing/generate', { method: 'POST' }))
);

server.registerTool(
  'orvyn_get_integration_status',
  {
    title: 'Get ORVYN Integration Status',
    description: 'Return the configured Ollama provider status and WhatsApp sidecar connection state.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => jsonContent(await request('/integrations/whatsapp'))
);

server.registerTool(
  'orvyn_update_reminder_schedule',
  {
    title: 'Update ORVYN Reminder Schedule',
    description: 'Update selected WhatsApp reminder times and notification toggles without changing the phone number, consent, or connection state.',
    inputSchema: {
      timezone: z.enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']).optional(),
      daily_briefing_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      deadline_lead_minutes: z.array(z.number().int().refine((value) => [30, 60, 180, 360, 720, 1440, 2880, 10080].includes(value))).min(1).max(8).optional(),
      progress_checkin_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      burnout_checkin_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      habit_checkin_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      weekly_review_day: z.number().int().min(1).max(7).optional().describe('ISO weekday: 1 is Monday and 7 is Sunday.'),
      weekly_review_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      daily_briefing_enabled: z.boolean().optional(),
      deadline_reminders_enabled: z.boolean().optional(),
      progress_checkins_enabled: z.boolean().optional(),
      burnout_checkins_enabled: z.boolean().optional(),
      habit_health_enabled: z.boolean().optional(),
      weekly_review_enabled: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async (input) => {
    const current = await request('/integrations/whatsapp');
    const settings = current?.data?.settings ?? {};
    const schedule = { ...(settings.reminder_schedule ?? {}) };
    const scheduleKeys = [
      'daily_briefing_time',
      'deadline_lead_minutes',
      'progress_checkin_time',
      'burnout_checkin_time',
      'habit_checkin_time',
      'weekly_review_day',
      'weekly_review_time',
    ];
    for (const key of scheduleKeys) {
      if (input[key] !== undefined) schedule[key] = input[key];
    }

    const features = { ...(settings.features ?? {}) };
    const featureKeys = {
      daily_briefing_enabled: 'daily_briefing',
      deadline_reminders_enabled: 'deadline_reminders',
      progress_checkins_enabled: 'progress_checkins',
      burnout_checkins_enabled: 'burnout_checkins',
      habit_health_enabled: 'habit_health',
      weekly_review_enabled: 'weekly_review',
    };
    for (const [inputKey, featureKey] of Object.entries(featureKeys)) {
      if (input[inputKey] !== undefined) features[featureKey] = input[inputKey];
    }

    return jsonContent(await request('/integrations/whatsapp', {
      method: 'PATCH',
      body: {
        timezone: input.timezone ?? settings.timezone,
        reminder_schedule: schedule,
        features,
      },
    }));
  }
);

server.registerTool(
  'orvyn_list_habits',
  {
    title: 'List ORVYN Habits',
    description: 'List habit streaks and recent check-ins.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => jsonContent(await request('/habits'))
);

server.registerTool(
  'orvyn_create_habit',
  {
    title: 'Create ORVYN Habit',
    description: 'Create a daily habit such as running, reading, or workout.',
    inputSchema: {
      name: z.string().min(1).max(120),
      category: z.string().max(60).optional(),
      unit: z.string().max(40).optional(),
      color: z.string().max(30).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async (input) => jsonContent(await request('/habits', { method: 'POST', body: input }))
);

server.registerTool(
  'orvyn_check_in_habit',
  {
    title: 'Check In ORVYN Habit',
    description: 'Check in a habit for today or a specific date.',
    inputSchema: {
      habit_id: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      value: z.number().int().min(1).max(99).optional(),
      note: z.string().max(255).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ habit_id, ...body }) => jsonContent(await request(`/habits/${encodeURIComponent(habit_id)}/check-ins`, { method: 'POST', body }))
);

server.registerTool(
  'orvyn_list_campus_schedules',
  {
    title: 'List ORVYN Campus Schedules',
    description: 'List Tel-U campus schedules, optionally filtered by day of week or active state.',
    inputSchema: {
      day_of_week: z.number().int().min(0).max(6).optional().describe('0 is Sunday, 1 is Monday, through 6 Saturday.'),
      active: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ day_of_week, active }) => jsonContent(await request('/campus-schedules', { params: { day_of_week, active } }))
);

server.registerTool(
  'orvyn_create_campus_schedule',
  {
    title: 'Create ORVYN Campus Schedule',
    description: 'Create a recurring campus class, lab, exam, or project schedule.',
    inputSchema: {
      course_name: z.string().min(1).max(160),
      course_code: z.string().max(30).optional(),
      lecturer: z.string().max(160).optional(),
      building: z.string().max(80).optional(),
      room: z.string().max(80).optional(),
      day_of_week: z.number().int().min(0).max(6),
      start_time: z.string().regex(/^\d{2}:\d{2}$/),
      end_time: z.string().regex(/^\d{2}:\d{2}$/),
      class_type: z.enum(['lecture', 'lab', 'project', 'exam', 'seminar']).optional(),
      commute_minutes: z.number().int().min(0).max(180).optional(),
      prep_minutes: z.number().int().min(0).max(180).optional(),
      notes: z.string().max(1000).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async (input) => jsonContent(await request('/campus-schedules', { method: 'POST', body: input }))
);

const transport = new StdioServerTransport();
await server.connect(transport);
