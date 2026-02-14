# CRM Module

**Customer Relationship Management for AI Agents**

A drop-in CRM system that lets AI agents track contacts, manage pipelines, log interactions, and handle follow-ups. Built for [AI Installer](https://ai-installer-dashboard.vercel.app) deployments.

## Features

- 📊 **Pipeline Management**: Customizable stages, drag-and-drop ready
- 👥 **Contact Tracking**: Companies, people, deals with full history
- 💬 **Interaction Logging**: Calls, emails, meetings, notes
- ✅ **Task Management**: Follow-ups with due dates and priorities
- 🔒 **Multi-tenant**: Isolated data per agent via `agent_id`
- 🤖 **Agent-friendly**: Built for AI agents to read/write

## Quick Start

### Installation

```bash
npm install
```

### Environment Setup

```bash
# .env file
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# Optional: Multi-tenant isolation
CRM_AGENT_ID=my-agent-name
```

### Database Setup

Run this SQL in your Supabase SQL editor:

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

-- Contacts (people or companies)
create table crm_contacts (
  id serial primary key,
  agent_id text not null default 'default',
  name text not null,
  email text,
  phone text,
  company text,
  role text,
  stage_id integer references crm_stages(id) on delete set null,
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

-- Interactions (every touchpoint)
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

-- Tasks/Follow-ups
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
create index idx_crm_stages_agent on crm_stages(agent_id);
create index idx_crm_contacts_agent on crm_contacts(agent_id);
create index idx_crm_contacts_stage on crm_contacts(stage_id);
create index idx_crm_contacts_assigned on crm_contacts(assigned_to);
create index idx_crm_interactions_agent on crm_interactions(agent_id);
create index idx_crm_interactions_contact on crm_interactions(contact_id);
create index idx_crm_tasks_agent on crm_tasks(agent_id);
create index idx_crm_tasks_contact on crm_tasks(contact_id);
create index idx_crm_tasks_due on crm_tasks(due_at) where not completed;
```

### CLI Usage

```bash
# Initialize default pipeline stages
node src/cli.js init

# Add a contact
node src/cli.js contacts add "Acme Corp" --email john@acme.com --company Acme

# List contacts
node src/cli.js contacts list
node src/cli.js contacts list --stage 1
node src/cli.js contacts list --assigned-to louis

# Search contacts
node src/cli.js contacts search "acme"

# Move contact to different stage
node src/cli.js contacts move 1 --stage 3

# Add interaction
node src/cli.js interactions add 1 --type call --content "Discussed pricing"

# Add a note
node src/cli.js interactions note 1 "Interested in premium plan"

# Add a task
node src/cli.js tasks add "Follow up with Acme" --contact 1 --due "2026-02-20"

# Complete a task
node src/cli.js tasks complete 1

# List overdue tasks
node src/cli.js tasks list --overdue

# Get pipeline stats
node src/cli.js stats
```

### Programmatic Usage

```javascript
import { CRM } from './src/index.js';

// Initialize
const crm = new CRM({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  agentId: 'my-agent'  // Optional: defaults to CRM_AGENT_ID or 'default'
});

// Initialize default stages (run once)
await crm.initializeDefaultStages();

// Create a contact
const contact = await crm.createContact({
  name: 'Acme Corporation',
  email: 'john@acme.com',
  company: 'Acme',
  role: 'CEO',
  source: 'referral',
  dealValue: 5000
});

// Move through pipeline
await crm.moveStage(contact.id, 2);  // Move to stage 2

// Log interactions
await crm.addNote(contact.id, 'Initial call went well', 'iris');
await crm.logCall(contact.id, {
  subject: 'Discovery call',
  content: 'Discussed their needs. Interested in AI automation.',
  createdBy: 'louis',
  duration: 30
});

// Create follow-up task
await crm.addTask({
  title: 'Send proposal to Acme',
  contactId: contact.id,
  dueAt: '2026-02-20T10:00:00Z',
  assignedTo: 'louis',
  priority: 'high'
});

// Search contacts
const results = await crm.searchContacts('acme');

// Get pipeline overview
const stats = await crm.getPipelineStats();

// List overdue tasks
const overdue = await crm.getOverdueTasks();

// Close connection
crm.close();
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CRM Module                        │
├─────────────────────────────────────────────────────┤
│  Stages    │  Contacts   │ Interactions │  Tasks    │
│  --------  │  ---------  │ ------------ │ -------   │
│  Pipeline  │  Companies  │ Calls        │ Follow-up │
│  stages    │  People     │ Emails       │ Reminders │
│            │  Deals      │ Meetings     │ To-dos    │
│            │             │ Notes        │           │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │       Supabase        │
              │  (Multi-tenant DB)    │
              │  agent_id isolation   │
              └───────────────────────┘
```

## Multi-Tenant Setup

For deployments with multiple agents/clients:

```bash
# Each agent gets isolated data
CRM_AGENT_ID=client_acme node src/cli.js contacts list
CRM_AGENT_ID=client_globex node src/cli.js contacts list
```

All agents can share the same Supabase project - data is isolated by `agent_id`.

## Interaction Types

| Type | Use Case |
|------|----------|
| `call` | Phone calls, voice chats |
| `email` | Email correspondence |
| `meeting` | In-person or video meetings |
| `note` | Internal notes, observations |
| `demo` | Product demonstrations |
| `proposal` | Sent proposals/quotes |

## Pipeline Stages

Default stages (customizable):

1. **Lead** - New potential customer
2. **Contacted** - Initial outreach made
3. **Qualified** - Confirmed fit/interest
4. **Proposal** - Proposal/quote sent
5. **Negotiation** - Terms being discussed
6. **Won** - Deal closed successfully

## Configuration

| Env Variable | Description | Default |
|--------------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | Required |
| `SUPABASE_KEY` | Supabase anon key | Required |
| `CRM_AGENT_ID` | Multi-tenant agent ID | `default` |

## API Reference

### Stages
- `listStages()` - Get all pipeline stages
- `createStage({ name, position, color })` - Create a stage
- `reorderStages([ids])` - Reorder stages
- `deleteStage(id)` - Delete a stage

### Contacts
- `listContacts(options)` - List with filters
- `getContact(id)` - Get single contact
- `createContact(data)` - Create contact
- `updateContact(id, updates)` - Update contact
- `moveStage(id, stageId)` - Move to stage
- `markLost(id, reason)` - Mark as lost
- `searchContacts(query)` - Search contacts
- `deleteContact(id)` - Delete contact

### Interactions
- `listInteractions(options)` - List interactions
- `addInteraction(data)` - Add interaction
- `addNote(contactId, content, by)` - Quick note
- `logCall(contactId, data)` - Log a call
- `logEmail(contactId, data)` - Log an email
- `deleteInteraction(id)` - Delete interaction

### Tasks
- `listTasks(options)` - List tasks
- `addTask(data)` - Add task
- `completeTask(id)` - Mark complete
- `uncompleteTask(id)` - Reopen task
- `getOverdueTasks()` - Get overdue tasks
- `deleteTask(id)` - Delete task

### Stats
- `getPipelineStats()` - Pipeline overview
- `getActivityStats(days)` - Activity metrics
- `getStats()` - Combined stats

## License

MIT
