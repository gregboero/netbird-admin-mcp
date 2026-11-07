import Ajv from 'ajv';
import formats from 'ajv-formats';
import { isIP } from 'node:net';
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
formats(ajv);
ajv.addFormat('cidr', value => {
  const [address, prefix, extra] = value.split('/');
  const family = isIP(address);
  return !extra && !!family && /^\d+$/.test(prefix ?? '') && Number(prefix) <= (family === 4 ? 32 : 128);
});
ajv.addFormat('int32', { type: 'number', validate: n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647 });
ajv.addFormat('int64', { type: 'number', validate: Number.isSafeInteger });
ajv.addFormat('float', { type: 'number', validate: Number.isFinite });
ajv.addFormat('double', { type: 'number', validate: Number.isFinite });
export function compile(schema) {
  const validate = ajv.compile(schema);
  return data => {
    if (!validate(data)) throw new Error('Invalid API request: ' + validate.errors.map(e =>
      (e.instancePath || '/') + ' ' + e.message +
      (e.params.missingProperty ? ' (' + e.params.missingProperty + ')' : '') +
      (e.params.additionalProperty ? ' (' + e.params.additionalProperty + ')' : '')).join('; '));
  };
}
