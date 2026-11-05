const {
  projectIdFrom,
  resolveProjectId,
  projectFileQuery,
  fileQuery,
} = require('../utils/fileScope');

describe('project file scoping', () => {
  test('reads a project id from a plain field, a populated project, or metadata', () => {
    expect(projectIdFrom({ projectId: 'p1' })).toBe('p1');
    expect(projectIdFrom({ project: { _id: 'p2' } })).toBe('p2');
    expect(projectIdFrom({ project: 'p3' })).toBe('p3');
    expect(projectIdFrom({ metadata: { get: (key) => (key === 'projectId' ? 'p4' : null) } })).toBe('p4');
    expect(projectIdFrom(null)).toBeNull();
  });

  test('prefers an explicit project, then the task, then the execution', () => {
    expect(resolveProjectId({ projectId: 'explicit', task: { projectId: 'task' }, execution: { projectId: 'exec' } })).toBe('explicit');
    expect(resolveProjectId({ task: { projectId: 'task' }, execution: { projectId: 'exec' } })).toBe('task');
    expect(resolveProjectId({ execution: { projectId: 'exec' } })).toBe('exec');
    expect(resolveProjectId({})).toBeNull();
  });

  test('scopes strict queries to the project, or to unassigned files without one', () => {
    expect(projectFileQuery('ws', 'p1')).toEqual({ project: 'p1' });
    expect(projectFileQuery('ws')).toEqual({ project: null, company: 'ws' });
  });

  test('workspace-wide tool queries only narrow when a project is provided', () => {
    expect(fileQuery('ws')).toEqual({ company: 'ws' });
    expect(fileQuery('ws', 'p1')).toEqual({ company: 'ws', project: 'p1' });
    expect(fileQuery(null, 'p1')).toEqual({ project: 'p1' });
  });
});
