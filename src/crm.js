/**
 * Main CRM (Customer Relationship Management) class
 * Manages contacts, pipeline stages, interactions, and tasks
 * 
 * Multi-tenant: All operations scoped by agent_id
 */

import { createDatabase } from './db.js';

export class CRM {
  constructor(config = {}) {
    this.db = createDatabase(config);
    this.agentId = config.agentId || process.env.CRM_AGENT_ID || 'default';
  }

  // ============ STAGES ============

  /**
   * List all pipeline stages
   */
  async listStages() {
    return this.db.listStages();
  }

  /**
   * Create a new pipeline stage
   * @param {Object} stage - { name, position, color? }
   */
  async createStage(stage) {
    if (!stage.name) {
      throw new Error('Stage name is required');
    }
    
    // Auto-assign position if not provided
    if (stage.position === undefined) {
      const existing = await this.db.listStages();
      stage.position = existing.length + 1;
    }
    
    return this.db.createStage(stage);
  }

  /**
   * Reorder stages
   * @param {number[]} stageIds - Array of stage IDs in desired order
   */
  async reorderStages(stageIds) {
    return this.db.reorderStages(stageIds);
  }

  /**
   * Delete a pipeline stage
   * Note: Contacts in this stage will have their stage_id set to null
   */
  async deleteStage(id) {
    return this.db.deleteStage(id);
  }

  // ============ CONTACTS ============

  /**
   * List contacts with optional filters
   * @param {Object} options - { stageId?, isActive?, assignedTo?, tags?, limit?, offset? }
   */
  async listContacts(options = {}) {
    return this.db.listContacts(options);
  }

  /**
   * Get a single contact by ID
   */
  async getContact(id) {
    return this.db.getContact(id);
  }

  /**
   * Create a new contact
   * @param {Object} contact - Contact data
   */
  async createContact(contact) {
    if (!contact.name) {
      throw new Error('Contact name is required');
    }
    return this.db.createContact(contact);
  }

  /**
   * Update an existing contact
   * @param {number} id - Contact ID
   * @param {Object} updates - Fields to update
   */
  async updateContact(id, updates) {
    return this.db.updateContact(id, updates);
  }

  /**
   * Move contact to a different pipeline stage
   * @param {number} id - Contact ID
   * @param {number} stageId - Target stage ID
   */
  async moveStage(id, stageId) {
    return this.db.moveContactStage(id, stageId);
  }

  /**
   * Mark contact as lost/inactive
   * @param {number} id - Contact ID
   * @param {string} reason - Reason for losing the contact
   */
  async markLost(id, reason) {
    return this.db.updateContact(id, {
      isActive: false,
      lostReason: reason
    });
  }

  /**
   * Reactivate a lost contact
   */
  async reactivate(id) {
    return this.db.updateContact(id, {
      isActive: true,
      lostReason: null
    });
  }

  /**
   * Delete a contact (and all associated interactions/tasks)
   */
  async deleteContact(id) {
    return this.db.deleteContact(id);
  }

  /**
   * Search contacts by name, email, company, or phone
   * @param {string} query - Search term
   * @param {Object} options - { limit? }
   */
  async searchContacts(query, options = {}) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.db.searchContacts(query, options);
  }

  // ============ INTERACTIONS ============

  /**
   * List interactions with optional filters
   * @param {Object} options - { contactId?, type?, limit? }
   */
  async listInteractions(options = {}) {
    return this.db.listInteractions(options);
  }

  /**
   * Add an interaction (call, email, meeting, note, etc.)
   * @param {Object} interaction - { contactId, type, subject?, content?, createdBy, ... }
   */
  async addInteraction(interaction) {
    if (!interaction.contactId) {
      throw new Error('Contact ID is required');
    }
    if (!interaction.type) {
      throw new Error('Interaction type is required');
    }
    if (!interaction.createdBy) {
      throw new Error('Created by is required');
    }
    return this.db.addInteraction(interaction);
  }

  /**
   * Update an interaction
   */
  async updateInteraction(id, updates) {
    return this.db.updateInteraction(id, updates);
  }

  /**
   * Delete an interaction
   */
  async deleteInteraction(id) {
    return this.db.deleteInteraction(id);
  }

  /**
   * Log a quick note on a contact
   * Convenience method for addInteraction with type='note'
   */
  async addNote(contactId, content, createdBy) {
    return this.addInteraction({
      contactId,
      type: 'note',
      content,
      createdBy
    });
  }

  /**
   * Log a call interaction
   */
  async logCall(contactId, { subject, content, createdBy, duration }) {
    return this.addInteraction({
      contactId,
      type: 'call',
      subject,
      content,
      createdBy,
      metadata: duration ? { duration } : {}
    });
  }

  /**
   * Log an email interaction
   */
  async logEmail(contactId, { subject, content, createdBy }) {
    return this.addInteraction({
      contactId,
      type: 'email',
      subject,
      content,
      createdBy
    });
  }

  // ============ TASKS ============

  /**
   * List tasks with optional filters
   * @param {Object} options - { contactId?, completed?, assignedTo?, priority?, dueBefore?, limit? }
   */
  async listTasks(options = {}) {
    return this.db.listTasks(options);
  }

  /**
   * Add a new task
   * @param {Object} task - { title, contactId?, description?, dueAt?, assignedTo?, priority? }
   */
  async addTask(task) {
    if (!task.title) {
      throw new Error('Task title is required');
    }
    return this.db.addTask(task);
  }

  /**
   * Complete a task
   */
  async completeTask(id) {
    return this.db.completeTask(id);
  }

  /**
   * Uncomplete (reopen) a task
   */
  async uncompleteTask(id) {
    return this.db.uncompleteTask(id);
  }

  /**
   * Update a task
   */
  async updateTask(id, updates) {
    return this.db.updateTask(id, updates);
  }

  /**
   * Delete a task
   */
  async deleteTask(id) {
    return this.db.deleteTask(id);
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks() {
    return this.db.getOverdueTask();
  }

  // ============ STATS ============

  /**
   * Get pipeline overview stats
   * Returns contacts and values grouped by stage
   */
  async getPipelineStats() {
    return this.db.getPipelineStats();
  }

  /**
   * Get activity stats for last N days
   * @param {number} days - Number of days to look back (default: 30)
   */
  async getActivityStats(days = 30) {
    return this.db.getActivityStats(days);
  }

  /**
   * Get combined stats overview
   */
  async getStats() {
    const [pipeline, activity] = await Promise.all([
      this.getPipelineStats(),
      this.getActivityStats()
    ]);
    
    return {
      agentId: this.agentId,
      pipeline,
      activity,
      generatedAt: new Date().toISOString()
    };
  }

  // ============ UTILITIES ============

  /**
   * Initialize default pipeline stages if none exist
   */
  async initializeDefaultStages() {
    const existing = await this.listStages();
    if (existing.length > 0) {
      return { status: 'already_initialized', stages: existing };
    }
    
    const defaultStages = [
      { name: 'Lead', position: 1, color: '#6366f1' },
      { name: 'Contacted', position: 2, color: '#8b5cf6' },
      { name: 'Qualified', position: 3, color: '#a855f7' },
      { name: 'Proposal', position: 4, color: '#d946ef' },
      { name: 'Negotiation', position: 5, color: '#ec4899' },
      { name: 'Won', position: 6, color: '#22c55e' }
    ];
    
    const created = [];
    for (const stage of defaultStages) {
      created.push(await this.createStage(stage));
    }
    
    return { status: 'initialized', stages: created };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

export default CRM;
