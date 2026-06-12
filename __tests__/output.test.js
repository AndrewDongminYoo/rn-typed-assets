'use strict';

const { parseOutputArg, emitSuccess, emitFailure } = require('../src/output');

describe('output', () => {
  test('parseOutputArg defaults to text and parses json in both flag forms', () => {
    expect(parseOutputArg([])).toBe('text');
    expect(parseOutputArg(['--output', 'json'])).toBe('json');
    expect(parseOutputArg(['--output=json'])).toBe('json');
    expect(parseOutputArg(['--output', 'text'])).toBe('text');
  });

  test('parseOutputArg throws on unsupported format', () => {
    expect(() => parseOutputArg(['--output', 'yaml'])).toThrow(
      'Unsupported output format: yaml',
    );
  });

  test('emitSuccess writes a single-line JSON envelope to stdout in json mode', () => {
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    emitSuccess({
      output: 'json',
      command: 'generate',
      data: { count: 2 },
      textLines: ['ignored in json mode'],
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledTimes(1);

    const written = writeSpy.mock.calls[0][0];
    expect(written.endsWith('\n')).toBe(true);
    expect(JSON.parse(written)).toEqual({
      ok: true,
      command: 'generate',
      data: { count: 2 },
      error: null,
    });

    writeSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('emitSuccess prints text lines and no JSON in text mode', () => {
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    emitSuccess({
      output: 'text',
      command: 'generate',
      data: { count: 2 },
      textLines: ['line one', 'line two'],
    });

    expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
      'line one',
      'line two',
    ]);
    expect(writeSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('emitFailure writes a JSON failure envelope to stdout in json mode', () => {
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    emitFailure({
      output: 'json',
      command: 'audit',
      message: 'boom',
      data: { stale: true },
    });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(JSON.parse(writeSpy.mock.calls[0][0])).toEqual({
      ok: false,
      command: 'audit',
      data: { stale: true },
      error: { message: 'boom' },
    });

    writeSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('emitFailure prints to stderr in text mode', () => {
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    emitFailure({ output: 'text', command: 'audit', message: 'boom' });

    expect(errorSpy).toHaveBeenCalledWith('boom');
    expect(writeSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
