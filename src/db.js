/**
 * Database abstraction layer for CRM
 * Uses Supabase as the backend
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Create Supabase database connection
 */
export function createDatabase(config = {}) {
  const url = config.supabaseUrl || process.env.SUPABASE_URL;
  const key = config.supabaseKey || process.env.SUPABASE_KEY;
  
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY are required');
  }
  
  const supabase = createClient(url, key);
  const agentId = config.agentId || process.env.CRM_AGENT_ID || 'default';
  
  return new SupabaseDB(supabase, agentId);
}

class SupabaseDB {
  constructor(client, agentId) {
    this.client = client;
    this.agentId = agentId;
  }

  // ============ STAGES ============
  
  async listStages() {
    const { data, error } = await this.client
      .from('crm_stages')
      .select('*')
      .eq('agent_id', this.agentId)
      .order('position');
    
    if (error) throw error;
    return data;
  }

  async createStage(stage) {
    const { data, error } = await this.client
      .from('crm_stages')
      .insert({
        agent_id: this.agentId,
        name: stage.name,
        position: stage.position,
        color: stage.color || null
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateStage(id, updates) {
    const { data, error } = await this.client
      .from('crm_stages')
      .update(updates)
      .eq('id', id)
      .eq('agent_id', this.agentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteStage(id) {
    const { data, error } = await this.client
      .from('crm_stages')
      .delete()
      .eq('id', id)
      .eq('agent_id', this.agentId);
    
    if (error) throw error;
    return { deleted: true };
  }

  async reorderStages(stageIds) {
    // Update each stage's position based on array order
    const updates = stageIds.map((id, index) => ({
      id,
      position: index + 1
    }));
    
    for (const update of updates) {
      await this.updateStage(update.id, { position: update.position });
    }
    
    return this.listStages();
  }

  // ============ CONTACTS ============
  
  async listContacts(options = {}) {
    let query = this.client
      .from('crm_contacts')
      .select('*, crm_stages(name, color)')
      .eq('agent_id', this.agentId);
    
    if (options.stageId) {
      query = query.eq('stage_id', options.stageId);
    }
    if (options.isActive !== undefined) {
      query = query.eq('is_active', options.isActive);
    }
    if (options.assignedTo) {
      query = query.eq('assigned_to', options.assignedTo);
    }
    if (options.tags && options.tags.length > 0) {
      query = query.overlaps('tags', options.tags);
    }
    
    query = query.order('updated_at', { ascending: false });
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async getContact(id) {
    const { data, error } = await this.client
      .from('crm_contacts')
      .select('*, crm_stages(name, color)')
      .eq('id', id)
      .eq('agent_id', this.agentId)
      .single();
    
    if (error) throw error;
    return data;
  }

  async createContact(contact) {
    const { data, error } = await this.client
      .from('crm_contacts')
      .insert({
        agent_id: this.agentId,
        name: contact.name,
        email: contact.email || null,
        phone: contact.phone || null,
        company: contact.company || null,
        role: contact.role || null,
        stage_id: contact.stageId || null,
        stage_entered_at: contact.stageId ? new Date().toISOString() : null,
        source: contact.source || null,
        source_detail: contact.sourceDetail || null,
        assigned_to: contact.assignedTo || null,
        tags: contact.tags || [],
        custom_fields: contact.customFields || {},
        deal_value: contact.dealValue || null,
        currency: contact.currency || 'AUD',
        is_active: contact.isActive !== false
      })
      .select('*, crm_stages(name, color)')
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateContact(id, updates) {
    const updateData = { updated_at: new Date().toISOString() };
    
    // Map camelCase to snake_case
    const fieldMap = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      company: 'company',
      role: 'role',
      stageId: 'stage_id',
      source: 'source',
      sourceDetail: 'source_detail',
      assignedTo: 'assigned_to',
      tags: 'tags',
      customFields: 'custom_fields',
      dealValue: 'deal_value',
      currency: 'currency',
      isActive: 'is_active',
      lostReason: 'lost_reason',
      lastContactAt: 'last_contact_at'
    };
    
    for (const [key, value] of Object.entries(updates)) {
      if (fieldMap[key]) {
        updateData[fieldMap[key]] = value;
      }
    }
    
    const { data, error } = await this.client
      .from('crm_contacts')
      .update(updateData)
      .eq('id', id)
      .eq('agent_id', this.agentId)
      .select('*, crm_stages(name, color)')
      .single();
    
    if (error) throw error;
    return data;
  }

  async moveContactStage(id, stageId) {
    const { data, error } = await this.client
      .from('crm_contacts')
      .update({
        stage_id: stageId,
        stage_entered_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('agent_id', this.agentId)
      .select('*, crm_stages(name, color)')
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteContact(id) {
    const { error } = await this.client
      .from('crm_contacts')
      .delete()
      .eq('id', id)
      .eq('agent_id', this.agentId);
    
    if (error) throw error;
    return { deleted: true };
  }

  async searchContacts(query, options = {}) {
    const searchTerm = `%${query}%`;
    
    let dbQuery = this.client
      .from('crm_contacts')
      .select('*, crm_stages(name, color)')
      .eq('agent_id', this.agentId)
      .or(`name.ilike.${searchTerm},email.ilike.${searchTerm},company.ilike.${searchTerm},phone.ilike.${searchTerm}`)
      .order('updated_at', { ascending: false });
    
    if (options.limit) {
      dbQuery = dbQuery.limit(options.limit);
    }
    
    const { data, error } = await dbQuery;
    if (error) throw error;
    return data;
  }

  // ============ INTERACTIONS ============
  
  async listInteractions(options = {}) {
    let query = this.client
      .from('crm_interactions')
      .select('*, crm_contacts(name, email, company)')
      .eq('agent_id', this.agentId);
    
    if (options.contactId) {
      query = query.eq('contact_id', options.contactId);
    }
    if (options.type) {
      query = query.eq('type', options.type);
    }
    
    query = query.order('created_at', { ascending: false });
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async addInteraction(interaction) {
    const { data, error } = await this.client
      .from('crm_interactions')
      .insert({
        agent_id: this.agentId,
        contact_id: interaction.contactId,
        type: interaction.type,
        subject: interaction.subject || null,
        content: interaction.content || null,
        created_by: interaction.createdBy,
        created_by_type: interaction.createdByType || 'agent',
        scheduled_at: interaction.scheduledAt || null,
        completed_at: interaction.completedAt || null,
        metadata: interaction.metadata || {}
      })
      .select('*, crm_contacts(name, email, company)')
      .single();
    
    if (error) throw error;
    
    // Update contact's last_contact_at
    await this.updateContact(interaction.contactId, {
      lastContactAt: new Date().toISOString()
    });
    
    return data;
  }

  async updateInteraction(id, updates) {
    const updateData = {};
    
    const fieldMap = {
      type: 'type',
      subject: 'subject',
      content: 'content',
      scheduledAt: 'scheduled_at',
      completedAt: 'completed_at',
      metadata: 'metadata'
    };
    
    for (const [key, value] of Object.entries(updates)) {
      if (fieldMap[key]) {
        updateData[fieldMap[key]] = value;
      }
    }
    
    const { data, error } = await this.client
      .from('crm_interactions')
      .update(updateData)
      .eq('id', id)
      .eq('agent_id', this.agentId)
      .select('*, crm_contacts(name, email, company)')
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteInteraction(id) {
    const { error } = await this.client
      .from('crm_interactions')
      .delete()
      .eq('id', id)
      .eq('agent_id', this.agentId);
    
    if (error) throw error;
    return { deleted: true };
  }

  // ============ TASKS ============
  
  async listTasks(options = {}) {
    let query = this.client
      .from('crm_tasks')
      .select('*, crm_contacts(name, email, company)')
      .eq('agent_id', this.agentId);
    
    if (options.contactId) {
      query = query.eq('contact_id', options.contactId);
    }
    if (options.completed !== undefined) {
      query = query.eq('completed', options.completed);
    }
    if (options.assignedTo) {
      query = query.eq('assigned_to', options.assignedTo);
    }
    if (options.priority) {
      query = query.eq('priority', options.priority);
    }
    if (options.dueBefore) {
      query = query.lte('due_at', options.dueBefore);
    }
    
    // Order: incomplete first, then by due date
    query = query
      .order('completed', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false });
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async addTask(task) {
    const { data, error } = await this.client
      .from('crm_tasks')
      .insert({
        agent_id: this.agentId,
        contact_id: task.contactId || null,
        title: task.title,
        description: task.description || null,
        due_at: task.dueAt || null,
        assigned_to: task.assignedTo || null,
        priority: task.priority || 'medium'
      })
      .select('*, crm_contacts(name, email, company)')
      .single();
    
    if (error) throw error;
    return data;
  }

  async completeTask(id) {
    const { data, error } = await this.client
      .from('crm_tasks')
      .update({
        completed: true,
        completed_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('agent_id', this.agentId)
      .select('*, crm_contacts(name, email, company)')
      .single();
    
    if (error) throw error;
    return data;
  }

  async uncompleteTask(id) {
    const { data, error } = await this.client
      .from('crm_tasks')
      .update({
        completed: false,
        completed_at: null
      })
      .eq('id', id)
      .eq('agent_id', this.agentId)
      .select('*, crm_contacts(name, email, company)')
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateTask(id, updates) {
    const updateData = {};
    
    const fieldMap = {
      title: 'title',
      description: 'description',
      dueAt: 'due_at',
      assignedTo: 'assigned_to',
      priority: 'priority',
      contactId: 'contact_id'
    };
    
    for (const [key, value] of Object.entries(updates)) {
      if (fieldMap[key]) {
        updateData[fieldMap[key]] = value;
      }
    }
    
    const { data, error } = await this.client
      .from('crm_tasks')
      .update(updateData)
      .eq('id', id)
      .eq('agent_id', this.agentId)
      .select('*, crm_contacts(name, email, company)')
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteTask(id) {
    const { error } = await this.client
      .from('crm_tasks')
      .delete()
      .eq('id', id)
      .eq('agent_id', this.agentId);
    
    if (error) throw error;
    return { deleted: true };
  }

  // ============ STATS ============
  
  async getPipelineStats() {
    // Get stages with contact counts
    const stages = await this.listStages();
    
    const { data: contacts, error } = await this.client
      .from('crm_contacts')
      .select('stage_id, deal_value, is_active')
      .eq('agent_id', this.agentId)
      .eq('is_active', true);
    
    if (error) throw error;
    
    const pipeline = stages.map(stage => {
      const stageContacts = contacts.filter(c => c.stage_id === stage.id);
      const totalValue = stageContacts.reduce((sum, c) => sum + (parseFloat(c.deal_value) || 0), 0);
      
      return {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        position: stage.position,
        count: stageContacts.length,
        value: totalValue
      };
    });
    
    // Add unstaged contacts
    const unstagedContacts = contacts.filter(c => !c.stage_id);
    if (unstagedContacts.length > 0) {
      pipeline.unshift({
        id: null,
        name: 'Unstaged',
        color: '#888888',
        position: 0,
        count: unstagedContacts.length,
        value: unstagedContacts.reduce((sum, c) => sum + (parseFloat(c.deal_value) || 0), 0)
      });
    }
    
    return {
      stages: pipeline,
      totalContacts: contacts.length,
      totalValue: contacts.reduce((sum, c) => sum + (parseFloat(c.deal_value) || 0), 0)
    };
  }

  async getActivityStats(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    const [interactions, tasks, contacts] = await Promise.all([
      this.client
        .from('crm_interactions')
        .select('type, created_at')
        .eq('agent_id', this.agentId)
        .gte('created_at', since.toISOString()),
      this.client
        .from('crm_tasks')
        .select('completed, completed_at, created_at')
        .eq('agent_id', this.agentId)
        .gte('created_at', since.toISOString()),
      this.client
        .from('crm_contacts')
        .select('created_at, is_active')
        .eq('agent_id', this.agentId)
        .gte('created_at', since.toISOString())
    ]);
    
    // Count interactions by type
    const interactionsByType = {};
    (interactions.data || []).forEach(i => {
      interactionsByType[i.type] = (interactionsByType[i.type] || 0) + 1;
    });
    
    return {
      period: `${days} days`,
      interactions: {
        total: (interactions.data || []).length,
        byType: interactionsByType
      },
      tasks: {
        created: (tasks.data || []).length,
        completed: (tasks.data || []).filter(t => t.completed).length
      },
      contacts: {
        created: (contacts.data || []).length,
        active: (contacts.data || []).filter(c => c.is_active).length
      }
    };
  }

  async getOverdueTask() {
    const now = new Date().toISOString();
    
    const { data, error } = await this.client
      .from('crm_tasks')
      .select('*, crm_contacts(name, email, company)')
      .eq('agent_id', this.agentId)
      .eq('completed', false)
      .lt('due_at', now)
      .order('due_at', { ascending: true });
    
    if (error) throw error;
    return data;
  }

  // ============ UTILITIES ============
  
  close() {
    // Supabase client doesn't need explicit closing
  }
}

export default createDatabase;
