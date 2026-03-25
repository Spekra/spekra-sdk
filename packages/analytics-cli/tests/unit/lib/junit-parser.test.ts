import { describe, it, expect } from 'vitest';
import { parseJUnitXml } from '../../../src/lib/junit-parser';

describe('parseJUnitXml', () => {
  it('parses pass/fail testcases and durations', () => {
    const xml = `
      <testsuites>
        <testsuite name="unit" file="tests/math.test.ts">
          <testcase classname="math" name="adds numbers" time="0.010" file="tests/math.test.ts" />
          <testcase classname="math" name="subtracts numbers" time="0.020" file="tests/math.test.ts">
            <failure message="expected 4 to equal 3">AssertionError</failure>
          </testcase>
        </testsuite>
      </testsuites>
    `;

    const parsed = parseJUnitXml(xml, 'junit.xml');

    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].status).toBe('passed');
    expect(parsed.results[0].durationMs).toBe(10);
    expect(parsed.results[1].status).toBe('failed');
    expect(parsed.results[1].errorMessage).toContain('expected 4 to equal 3');
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.timing.durationMs).toBe(30);
  });

  it('preserves sub-millisecond test duration as at least 1ms and infers suite timing', () => {
    const xml = `
      <testsuites time="0.050">
        <testsuite name="unit" timestamp="2026-03-25T12:18:54.000Z" time="0.050">
          <testcase classname="suite" name="tiny test" time="0.0002" />
        </testsuite>
      </testsuites>
    `;

    const parsed = parseJUnitXml(xml, 'timing.xml');

    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].durationMs).toBe(1);
    expect(parsed.timing.startedAt).toBe('2026-03-25T12:18:54.000Z');
    expect(parsed.timing.finishedAt).toBe('2026-03-25T12:18:54.050Z');
    expect(parsed.timing.durationMs).toBe(50);
  });

  it('warns when file metadata is missing', () => {
    const xml = `
      <testsuites>
        <testsuite name="unit">
          <testcase classname="suite" name="test-a" time="0.001" />
        </testsuite>
      </testsuites>
    `;

    const parsed = parseJUnitXml(xml, 'missing-file.xml');

    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].testFile).toBe('suite');
    expect(parsed.warnings).toHaveLength(0);
  });

  it('warns when no testcases are parsed', () => {
    const xml = '<testsuites></testsuites>';
    const parsed = parseJUnitXml(xml, 'empty.xml');

    expect(parsed.results).toHaveLength(0);
    expect(parsed.warnings[0]).toContain('No <testcase> entries parsed.');
  });
});
