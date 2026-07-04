'use strict';

const OUTPUT_FORMATS = new Set(['text', 'json']);

const parseFlagValue = (argv, flag) => {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith(`${flag}=`)) {
      return argv[i].slice(flag.length + 1);
    }

    if (argv[i] === flag && argv[i + 1]) {
      return argv[i + 1];
    }
  }

  return null;
};

const parseOutputArg = (argv) => {
  const value = parseFlagValue(argv, '--output');

  if (value === null) {
    return 'text';
  }

  if (!OUTPUT_FORMATS.has(value)) {
    throw new Error(`Unsupported output format: ${value}`);
  }

  return value;
};

const writeEnvelope = (envelope) => {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
};

const emitSuccess = ({ output, command, data = null, textLines = [] }) => {
  if (output === 'json') {
    writeEnvelope({ ok: true, command, data, error: null });
    return;
  }

  for (const line of textLines) {
    if (line != null) {
      console.log(line);
    }
  }
};

const emitFailure = ({ output, command, message, data = null }) => {
  if (output === 'json') {
    writeEnvelope({ ok: false, command, data, error: { message } });
    return;
  }

  console.error(message);
};

module.exports = {
  parseFlagValue,
  parseOutputArg,
  emitSuccess,
  emitFailure,
};
