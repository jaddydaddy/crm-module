#!/usr/bin/env node
/**
 * CRM CLI - Command line interface for the CRM module
 */

import { CRM } from './crm.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables from .env if exists
try {
  const envPath = resolve(process.cwd(), '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
} catch { /* no .env file */ }

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  const agentId = process.env.CRM_AGENT_ID || 'default';
  console.log(`
CRM Module CLI

Agent ID: ${agentId}

Usage:
  crm stages [list|create|reorder|delete]
  crm contacts [list|get|create|update|delete|search|move]
  crm interactions [list|add|update|delete]
  crm tasks [list|add|complete|delete]
  crm stats [pipeline|activity|all]
  crm init  -- Initialize default pipeline stages

Stages:
  crm stages list
  crm stages create <name> [--color #hex]
  crm stages delete <id>

Contacts:
  crm contacts list [--stage <id>] [--active] [--limit N]
  crm contacts get <id>
  crm contacts create <name> [--email X] [--phone X] [--company X] [--stage <id>]
  crm contacts update <id> [--name X] [--email X] [--stage <id>] [--value X]
  crm contacts delete <id>
  crm contacts search <query>
  crm contacts move <id> <stage_id>

Interactions:
  crm interactions list [--contact <id>] [--type X] [--limit N]
  crm interactions add <contact_id> <type> <content> [--by <user>]
  crm interactions delete <id>

Tasks:
  crm tasks list [--pending] [--overdue] [--contact <id>]
  crm tasks add <title> [--contact <id>] [--due <date>] [--priority high|medium|low]
  crm tasks complete <id>
  crm tasks delete <id>

Stats:
  crm stats pipeline
  crm stats activity [--days N]
  crm stats all

Environment:
  SUPABASE_URL    - Supabase project URL (required)
  SUPABASE_KEY    - Supabase anon key (required)
  CRM_AGENT_ID    - Multi-tenant agent ID (default: 'default')
`);
}

function parseArgs(args) {
  const opts = {};
  let positional = [];
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      opts[key] = value;
    } else {
      positional.push(args[i]);
    }
  }
  
  return { opts, positional };
}

function formatContact(c) {
  const stage = c.crm_stages?.name || 'Unstaged';
  const value = c.deal_value ? ` | $${c.deal_value}` : '';
  const email = c.email ? ` <${c.email}>` : '';
  const company = c.company ? ` @ ${c.company}` : '';
  const status = c.is_active ? '' : ' [LOST]';
  return `[${c.id}] ${c.name}${email}${company} | ${stage}${value}${status}`;
}

function formatTask(t) {
  const status = t.completed ? '✓' : '○';
  const due = t.due_at ? ` (due: ${new Date(t.due_at).toLocaleDateString()})` : '';
  const contact = t.crm_contacts?.name ? ` [${t.crm_contacts.name}]` : '';
  const priority = t.priority !== 'medium' ? ` [${t.priority.toUpperCase()}]` : '';
  return `${status} [${t.id}] ${t.title}${contact}${due}${priority}`;
}

function formatInteraction(i) {
  const date = new Date(i.created_at).toLocaleDateString();
  const contact = i.crm_contacts?.name || 'Unknown';
  const subject = i.subject ? `: ${i.subject}` : '';
  return `[${i.id}] ${date} | ${i.type.toUpperCase()}${subject} | ${contact} | by ${i.created_by}`;
}

async function main() {
  if (!command || command === 'help' || command === '--help') {
    printUsage();
    process.exit(0);
  }

  // Check for required env vars
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_KEY environment variables are required');
    process.exit(1);
  }

  const { opts, positional } = parseArgs(args.slice(1));
  const crm = new CRM();

  try {
    switch (command) {
      // ============ INIT ============
      case 'init': {
        const result = await crm.initializeDefaultStages();
        if (result.status === 'already_initialized') {
          console.log('Pipeline already initialized. Existing stages:');
        } else {
          console.log('Initialized default pipeline stages:');
        }
        result.stages.forEach(s => {
          console.log(`  [${s.id}] ${s.name} (${s.color || 'no color'})`);
        });
        break;
      }

      // ============ STAGES ============
      case 'stages': {
        const subCmd = positional[0] || 'list';
        
        if (subCmd === 'list') {
          const stages = await crm.listStages();
          console.log('\nPipeline Stages:');
          if (stages.length === 0) {
            console.log('  No stages defined. Run: crm init');
          } else {
            stages.forEach(s => {
              console.log(`  [${s.id}] ${s.position}. ${s.name} (${s.color || 'no color'})`);
            });
          }
        } else if (subCmd === 'create') {
          const name = positional[1];
          if (!name) {
            console.error('Error: Stage name required');
            process.exit(1);
          }
          const stage = await crm.createStage({
            name,
            color: opts.color
          });
          console.log(`Created stage: [${stage.id}] ${stage.name}`);
        } else if (subCmd === 'delete') {
          const id = parseInt(positional[1]);
          if (!id) {
            console.error('Error: Stage ID required');
            process.exit(1);
          }
          await crm.deleteStage(id);
          console.log(`Deleted stage ${id}`);
        }
        break;
      }

      // ============ CONTACTS ============
      case 'contacts': {
        const subCmd = positional[0] || 'list';
        
        if (subCmd === 'list') {
          const contacts = await crm.listContacts({
            stageId: opts.stage ? parseInt(opts.stage) : undefined,
            isActive: opts.active ? true : undefined,
            limit: opts.limit ? parseInt(opts.limit) : 20
          });
          console.log(`\nContacts (${contacts.length}):`);
          contacts.forEach(c => console.log('  ' + formatContact(c)));
        } else if (subCmd === 'get') {
          const id = parseInt(positional[1]);
          if (!id) {
            console.error('Error: Contact ID required');
            process.exit(1);
          }
          const contact = await crm.getContact(id);
          console.log('\nContact Details:');
          console.log(JSON.stringify(contact, null, 2));
        } else if (subCmd === 'create') {
          const name = positional[1];
          if (!name) {
            console.error('Error: Contact name required');
            process.exit(1);
          }
          const contact = await crm.createContact({
            name,
            email: opts.email,
            phone: opts.phone,
            company: opts.company,
            stageId: opts.stage ? parseInt(opts.stage) : undefined,
            dealValue: opts.value ? parseFloat(opts.value) : undefined,
            source: opts.source,
            tags: opts.tags ? opts.tags.split(',') : []
          });
          console.log(`Created contact: ${formatContact(contact)}`);
        } else if (subCmd === 'update') {
          const id = parseInt(positional[1]);
          if (!id) {
            console.error('Error: Contact ID required');
            process.exit(1);
          }
          const updates = {};
          if (opts.name) updates.name = opts.name;
          if (opts.email) updates.email = opts.email;
          if (opts.phone) updates.phone = opts.phone;
          if (opts.company) updates.company = opts.company;
          if (opts.stage) updates.stageId = parseInt(opts.stage);
          if (opts.value) updates.dealValue = parseFloat(opts.value);
          
          const contact = await crm.updateContact(id, updates);
          console.log(`Updated: ${formatContact(contact)}`);
        } else if (subCmd === 'delete') {
          const id = parseInt(positional[1]);
          if (!id) {
            console.error('Error: Contact ID required');
            process.exit(1);
          }
          await crm.deleteContact(id);
          console.log(`Deleted contact ${id}`);
        } else if (subCmd === 'search') {
          const query = positional.slice(1).join(' ');
          if (!query) {
            console.error('Error: Search query required');
            process.exit(1);
          }
          const results = await crm.searchContacts(query);
          console.log(`\nSearch Results (${results.length}):`);
          results.forEach(c => console.log('  ' + formatContact(c)));
        } else if (subCmd === 'move') {
          const [, contactId, stageId] = positional;
          if (!contactId || !stageId) {
            console.error('Error: Contact ID and Stage ID required');
            process.exit(1);
          }
          const contact = await crm.moveStage(parseInt(contactId), parseInt(stageId));
          console.log(`Moved: ${formatContact(contact)}`);
        }
        break;
      }

      // ============ INTERACTIONS ============
      case 'interactions': {
        const subCmd = positional[0] || 'list';
        
        if (subCmd === 'list') {
          const interactions = await crm.listInteractions({
            contactId: opts.contact ? parseInt(opts.contact) : undefined,
            type: opts.type,
            limit: opts.limit ? parseInt(opts.limit) : 20
          });
          console.log(`\nInteractions (${interactions.length}):`);
          interactions.forEach(i => console.log('  ' + formatInteraction(i)));
        } else if (subCmd === 'add') {
          const [, contactId, type, ...contentParts] = positional;
          if (!contactId || !type) {
            console.error('Error: Contact ID and type required');
            process.exit(1);
          }
          const interaction = await crm.addInteraction({
            contactId: parseInt(contactId),
            type,
            content: contentParts.join(' ') || undefined,
            subject: opts.subject,
            createdBy: opts.by || 'cli'
          });
          console.log(`Added: ${formatInteraction(interaction)}`);
        } else if (subCmd === 'delete') {
          const id = parseInt(positional[1]);
          if (!id) {
            console.error('Error: Interaction ID required');
            process.exit(1);
          }
          await crm.deleteInteraction(id);
          console.log(`Deleted interaction ${id}`);
        }
        break;
      }

      // ============ TASKS ============
      case 'tasks': {
        const subCmd = positional[0] || 'list';
        
        if (subCmd === 'list') {
          let taskOpts = {
            limit: opts.limit ? parseInt(opts.limit) : 20
          };
          if (opts.pending) taskOpts.completed = false;
          if (opts.contact) taskOpts.contactId = parseInt(opts.contact);
          if (opts.overdue) taskOpts.dueBefore = new Date().toISOString();
          
          const tasks = await crm.listTasks(taskOpts);
          console.log(`\nTasks (${tasks.length}):`);
          tasks.forEach(t => console.log('  ' + formatTask(t)));
        } else if (subCmd === 'add') {
          const title = positional.slice(1).join(' ');
          if (!title) {
            console.error('Error: Task title required');
            process.exit(1);
          }
          const task = await crm.addTask({
            title,
            contactId: opts.contact ? parseInt(opts.contact) : undefined,
            dueAt: opts.due ? new Date(opts.due).toISOString() : undefined,
            priority: opts.priority || 'medium',
            assignedTo: opts.assign
          });
          console.log(`Added: ${formatTask(task)}`);
        } else if (subCmd === 'complete') {
          const id = parseInt(positional[1]);
          if (!id) {
            console.error('Error: Task ID required');
            process.exit(1);
          }
          const task = await crm.completeTask(id);
          console.log(`Completed: ${formatTask(task)}`);
        } else if (subCmd === 'delete') {
          const id = parseInt(positional[1]);
          if (!id) {
            console.error('Error: Task ID required');
            process.exit(1);
          }
          await crm.deleteTask(id);
          console.log(`Deleted task ${id}`);
        }
        break;
      }

      // ============ STATS ============
      case 'stats': {
        const subCmd = positional[0] || 'all';
        
        if (subCmd === 'pipeline' || subCmd === 'all') {
          const pipeline = await crm.getPipelineStats();
          console.log('\n📊 Pipeline Overview:');
          console.log(`  Total Contacts: ${pipeline.totalContacts}`);
          console.log(`  Total Value: $${pipeline.totalValue.toLocaleString()}`);
          console.log('\n  Stages:');
          pipeline.stages.forEach(s => {
            const bar = '█'.repeat(Math.min(s.count, 20));
            console.log(`    ${s.name.padEnd(15)} ${String(s.count).padStart(3)} ${bar} ($${s.value.toLocaleString()})`);
          });
        }
        
        if (subCmd === 'activity' || subCmd === 'all') {
          const days = opts.days ? parseInt(opts.days) : 30;
          const activity = await crm.getActivityStats(days);
          console.log(`\n📈 Activity (Last ${activity.period}):`);
          console.log(`  Contacts Created: ${activity.contacts.created}`);
          console.log(`  Interactions: ${activity.interactions.total}`);
          if (Object.keys(activity.interactions.byType).length > 0) {
            console.log('    By Type:');
            Object.entries(activity.interactions.byType).forEach(([type, count]) => {
              console.log(`      ${type}: ${count}`);
            });
          }
          console.log(`  Tasks Created: ${activity.tasks.created}`);
          console.log(`  Tasks Completed: ${activity.tasks.completed}`);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    crm.close();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
