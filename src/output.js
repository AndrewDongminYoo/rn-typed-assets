'use strict';

const OUTPUT_FORMATS = new Set(['text', 'json']);

const parseOutputArg = (argv) => {
  let value;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith('--output=')) {
      value = arg.slice('--output='.length);
      break;
    }

    if (arg === '--output' && argv[index + 1]) {
      value = argv[index + 1];
      break;
    }
  }

  if (value === undefined) {
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
  parseOutputArg,
  emitSuccess,
  emitFailure,
};
