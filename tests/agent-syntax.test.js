const orchestrator = require('../utils/agentOrchestrator');

describe('agent checkSyntax', () => {
  test('accepts valid JavaScript', () => {
    const result = orchestrator.checkSyntax('const answer = 42;', 'javascript');
    expect(result.valid).toBe(true);
    expect(result.heuristic).toBe(false);
  });

  test('reports JavaScript parse errors with positions', () => {
    const result = orchestrator.checkSyntax('const answer = ;', 'javascript');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toEqual(expect.objectContaining({
      line: 1,
      column: expect.any(Number),
      message: expect.any(String),
    }));
  });

  test('accepts valid TypeScript and JSX', () => {
    expect(orchestrator.checkSyntax('const answer: number = 42;', 'typescript').valid).toBe(true);
    expect(orchestrator.checkSyntax('const view = <div>ok</div>;', 'tsx').valid).toBe(true);
  });

  test('marks unsupported languages as heuristic instead of valid', () => {
    const result = orchestrator.checkSyntax('print("hello")', 'python');
    expect(result).toEqual(expect.objectContaining({ valid: null, heuristic: true }));
  });
});
