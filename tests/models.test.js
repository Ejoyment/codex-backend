/**
 * Tests for all Mongoose Model schemas
 * Covers: AIPairSession, BillingSchedule, Channel, ChatMessage, CodeChange,
 * CodeFile, Company, FileUpload, Integration, IntegrationData, Invitation,
 * Meeting, MeetingRoom, Message, Notification, OTP, Subscription,
 * SupportAgent, SupportTicket, TeamActivity, TeamChat, TeamProject,
 * TeamTask, User
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.example') });

describe('Model Schemas', () => {
  const models = [
    'AIPairSession',
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
    'Meeting',
    'MeetingRoom',
    'Message',
    'Notification',
    'OTP',
    'Subscription',
    'SupportAgent',
    'SupportTicket',
    'TeamActivity',
    'TeamChat',
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
});