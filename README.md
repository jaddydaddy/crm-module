# CRM Module

**Portable CRM (Customer Relationship Management) for AI Agents**

A lightweight, multi-tenant CRM system built for AI agents to manage contacts, pipelines, interactions, and tasks. Supabase/PostgreSQL backend.

Built for [AI Installer](https://ai-installer-dashboard.vercel.app) client deployments.

## Features

- 🎯 **Pipeline Management**: Customizable sales stages per agent
- 👥 **Contact Management**: Full CRUD with search, tags, custom fields
- 💬 **Interaction Tracking**: Log calls, emails, meetings, notes
- ✅ **Task Management**: Tasks with priorities, due dates, assignments
- 📊 **Analytics**: Pipeline stats, activity metrics
- 🔒 **Multi-tenant**: Isolated data per agent via `agent_id`

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Supabase Setup

Create a Supabase project at [supabase.com](https://supabase.com) and run the SQL schema (see below).

### 3. Environment

```bash
# .env file
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
CRM_AGENT_ID=my-agent  # optional, defaults to 'default'
```

### 4. Initialize Pipeline

```bash
node src/cli.js init
```

### 5. Start Using

```bash
# Add a contact
node src/cli.js contacts create "John Doe" --email john@example.com --stage 1

# List contacts
node src/cli.js contacts list

# View stats
node src/cli.js stats
```

## CLI Reference

```bash
# Initialize default pipeline stages
crm init

# Stages
crm stages list
crm stages create "New Stage" --color "#ff6b6b"
crm stages delete <id>

# Contacts
crm contacts list [--stage <id>] [--active] [--limit N]
crm contacts get <id>
crm contacts create "Name" [--email X] [--phone X] [--company X] [--stage <id>] [--value X]
crm contacts update <id> [--name X] [--email X] [--stage <id>] [--value X]
crm contacts delete <id>
crm contacts search "query"
crm contacts move <contact_id> <stage_id>

# Interactions
crm interactions list [--contact <id>] [--type X] [--limit N]
crm interactions add <contact_id> <type> "content" [--by <user>] [--subject X]
crm interactions delete <id>

# Tasks
crm tasks list [--pending] [--overdue] [--contact <id>]
crm tasks add "Task title" [--contact <id>] [--due "2024-03-15"] [--priority high]
crm tasks complete <id>
crm tasks delete <id>

# Stats
crm stats pipeline
crm stats activity [--days 30]
crm stats all
```

## Programmatic Usage

```javascript
import { CRM } from './src/index.js';

const crm = new CRM({
  agentId: 'my-agent'  // or set CRM_AGENT_ID env var
});

// Initialize pipeline (if needed)
await crm.initializeDefaultStages();

// Stages
const stages = await crm.listStages();
await crm.createStage({ name: 'Discovery', color: '#6366f1' });

// Contacts
const contact = await crm.createContact({
  name: 'Jane Smith',
  email: 'jane@example.com',
  company: 'Acme Corp',
  stageId: 1,
  dealValue: 15000,
  tags: ['enterprise', 'priority']
});

const contacts = await crm.listContacts({ isActive: true });
const results = await crm.searchContacts('jane');
await crm.moveStage(contact.id, 3);  // Move to stage 3
await crm.markLost(contact.id, 'Budget constraints');

// Interactions
await crm.addInteraction({
  contactId: contact.id,
  type: 'call',
  subject: 'Discovery call',
  content: 'Discussed their needs...',
  createdBy: 'agent-iris'
});

// Convenience methods
await crm.addNote(contact.id, 'Follow up next week', 'agent-iris');
await crm.logCall(contact.id, {
  subject: 'Follow-up',
  content: 'They are ready to proceed',
  createdBy: 'agent-iris',
  duration: 1800
});

// Tasks
const task = await crm.addTask({
  title: 'Send proposal',
  contactId: contact.id,
  dueAt: new Date('2024-03-15').toISOString(),
  priority: 'high'
});

await crm.completeTask(task.id);
const overdue = await crm.getOverdueTasks();

// Stats
const stats = await crm.getStats();
console.log(stats.pipeline.totalValue);  // Total deal value
console.log(stats.activity.interactions.total);  // Activity count

// Cleanup
crm.close();
```

## Supabase SQL Schema

Run this in your Supabase SQL editor:

```sql
-- Pipeline stages (customizable per agent)
create table crm_stages (
  id serial primary key,
  agent_id text not null default 'default',
  name text not null,
  position integer not null,
  color text,
  created_at timestamptz default now()
);

-- Contacts
create table crm_contacts (
  id serial primary key,
  agent_id text not null default 'default',
  name text not null,
  email text,
  phone text,
  company text,
  role text,
  stage_id integer references crm_stages(id),
  stage_entered_at timestamptz default now(),
  source text,
  source_detail text,
  assigned_to text,
  tags text[] default '{}',
  custom_fields jsonb default '{}',
  deal_value decimal,
  currency text default 'AUD',
  is_active boolean default true,
  lost_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_contact_at timestamptz
);

-- Interactions
create table crm_interactions (
  id serial primary key,
  agent_id text not null default 'default',
  contact_id integer references crm_contacts(id) on delete cascade,
  type text not null,
  subject text,
  content text,
  created_by text not null,
  created_by_type text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Tasks
create table crm_tasks (
  id serial primary key,
  agent_id text not null default 'default',
  contact_id integer references crm_contacts(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  assigned_to text,
  priority text default 'medium',
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes for performance
create index idx_stages_agent on crm_stages(agent_id);
create index idx_contacts_agent on crm_contacts(agent_id);
create index idx_contacts_stage on crm_contacts(stage_id);
create index idx_contacts_active on crm_contacts(agent_id, is_active);
create index idx_interactions_agent on crm_interactions(agent_id);
create index idx_interactions_contact on crm_interactions(contact_id);
create index idx_tasks_agent on crm_tasks(agent_id);
create index idx_tasks_contact on crm_tasks(contact_id);
create index idx_tasks_due on crm_tasks(agent_id, completed, due_at);

-- Row Level Security (optional but recommended)
alter table crm_stages enable row level security;
alter table crm_contacts enable row level security;
alter table crm_interactions enable row level security;
alter table crm_tasks enable row level security;

-- Example RLS policies (adjust for your auth setup)
-- These allow all access with anon key - customize for production
create policy "Allow all access to stages" on crm_stages for all using (true);
create policy "Allow all access to contacts" on crm_contacts for all using (true);
create policy "Allow all access to interactions" on crm_interactions for all using (true);
create policy "Allow all access to tasks" on crm_tasks for all using (true);
```

## Multi-Tenant Setup

For AI Installer deployments with multiple client agents:

```bash
# Each agent has isolated data
CRM_AGENT_ID=client_acme node src/cli.js contacts create "John"
CRM_AGENT_ID=client_globex node src/cli.js contacts create "Jane"

# Queries only return that agent's data
CRM_AGENT_ID=client_acme node src/cli.js contacts list
# Shows only John

CRM_AGENT_ID=client_globex node src/cli.js contacts list
# Shows only Jane
```

All agents share the same Supabase project, but data is fully isolated by `agent_id`.

## Interaction Types

Suggested interaction types (not enforced):

| Type | Description |
|------|-------------|
| `call` | Phone call |
| `email` | Email sent/received |
| `meeting` | In-person or video meeting |
| `note` | Internal note |
| `message` | Chat/SMS message |
| `demo` | Product demonstration |
| `proposal` | Proposal sent |

## Task Priorities

| Priority | Use Case |
|----------|----------|
| `low` | Nice to have, no urgency |
| `medium` | Normal priority (default) |
| `high` | Urgent, needs attention |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CRM Class                         │
│  (contacts, stages, interactions, tasks, stats)     │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                Database Layer                        │
│           (Supabase JS Client)                      │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                   Supabase                          │
│        (PostgreSQL + Row Level Security)            │
└─────────────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_KEY` | Supabase anon key | Yes |
| `CRM_AGENT_ID` | Multi-tenant agent ID | No (defaults to 'default') |

## License

MIT
