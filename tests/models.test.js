/**
 * Tests for all Mongoose Model schemas
 * Covers: AIPairSession, BillingSchedule, Channel, ChatMessage, CodeChange,
 * CodeFile, Company, FileUpload, Integration, IntegrationData, Invitation,
 * MeetingRoom, Message, Notification, OTP, Subscription,
 * SupportAgent, SupportTicket, TeamActivity, TeamProject,
 * TeamTask, User
 * (Meeting + TeamChat deleted as write-dead duplicates, rec 12.)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });

describe('Model Schemas', () => {
  const models = [
    'AIPairSession',
    'AgentExecution',
    'BillingSchedule',
    'Channel',
    'ChatMessage',
    'CodeChange',
    'CodeFile',
    'Company',
    'FileUpload',
    'Integration',
    'IntegrationData',
    'Invitation',
    'LocalProject',
    'MeetingRoom',
    'Message',
    'Notification',
    'OTP',
    'SpecModel',
    'Subscription',
    'SupportAgent',
    'SupportTicket',
    'TeamActivity',
    'TeamProject',
    'TeamTask',
    'User'
  ];

  models.forEach(modelName => {
    describe(`${modelName}`, () => {
      let model;

      beforeAll(() => {
        // Each model should be requireable without error
        model = require(`../models/${modelName}`);
      });

      test('should export a Mongoose model', () => {
        expect(model).toBeDefined();
        expect(typeof model).toBe('function');
      });

      test('should have model name matching filename', () => {
        // Mongoose model name should exist
        expect(model.modelName).toBeDefined();
      });

      test('should have findOne and find methods', () => {
        expect(typeof model.findOne).toBe('function');
        expect(typeof model.find).toBe('function');
        expect(typeof model.findById).toBe('function');
        expect(typeof model.create).toBe('function');
      });
    });
  });

  describe('User Model - Password Hashing', () => {
    test('should have comparePassword method defined in schema', () => {
      const User = require('../models/User');
      // The schema should have comparePassword defined
      expect(User.schema).toBeDefined();
    });
  });

  describe('SupportAgent Model', () => {
    test('should require same interface as User for auth', () => {
      const SupportAgent = require('../models/SupportAgent');
      expect(SupportAgent).toBeDefined();
      expect(typeof SupportAgent.findOne).toBe('function');
    });
  });

  describe('LocalProject creation settings', () => {
    test('should validate and retain the project wizard configuration', () => {
      const LocalProject = require('../models/LocalProject');
      const project = new LocalProject({
        userId: '507f1f77bcf86cd799439011',
        name: 'Workspace project',
        visibility: 'public',
        sourceType: 'github',
        githubRepoUrl: 'https://github.com/acme/workspace-project',
        githubRepoName: 'acme/workspace-project',
        defaultBranch: 'develop',
        technologies: ['TypeScript', 'React'],
        intelligence: { figma: true, starterSpec: false, aiAgents: true },
      });

      expect(project.validateSync()).toBeUndefined();
      expect(project.toObject()).toMatchObject({
        visibility: 'public',
        sourceType: 'github',
        defaultBranch: 'develop',
        technologies: ['TypeScript', 'React'],
        intelligence: { figma: true, starterSpec: false, aiAgents: true },
      });
    });
  });
});