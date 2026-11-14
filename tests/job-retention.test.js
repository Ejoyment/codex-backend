/**
 * DES-04 — terminal job rows are aged out by a TTL index, and pending work is
 * never picked up by it because only terminal transitions set `purgeAt`.
 */
const EmailJob = require('../models/EmailJob');
const AuditOutbox = require('../models/AuditOutbox');

function ttlIndexesFor(model, field) {
  return model.schema.indexes().filter(
    ([keys, options]) => keys[field] === 1 && options && 'expireAfterSeconds' in options
  );
}

describe('job collection retention', () => {
  test('EmailJob has a TTL index on purgeAt only', () => {
    expect(ttlIndexesFor(EmailJob, 'purgeAt')).toHaveLength(1);
    expect(ttlIndexesFor(EmailJob, 'purgeAt')[0][1]).toEqual(expect.objectContaining({ expireAfterSeconds: 0 }));
    // createdAt must not be a TTL field: pending work would be deleted.
    expect(ttlIndexesFor(EmailJob, 'createdAt')).toHaveLength(0);
    expect(EmailJob.schema.path('purgeAt')).toBeDefined();
  });

  test('AuditOutbox has a TTL index on purgeAt only', () => {
    expect(ttlIndexesFor(AuditOutbox, 'purgeAt')).toHaveLength(1);
    expect(ttlIndexesFor(AuditOutbox, 'purgeAt')[0][1]).toEqual(expect.objectContaining({ expireAfterSeconds: 0 }));
    expect(ttlIndexesFor(AuditOutbox, 'createdAt')).toHaveLength(0);
    expect(AuditOutbox.schema.path('purgeAt')).toBeDefined();
  });
});
