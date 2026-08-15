import { registerResource } from '../crud.js';

registerResource({
  name: 'metric',
  plural: 'metrics',
  table: 'metrics',
  description:
    'Runtime metrics — counters and delivery/timing telemetry flushed by the metrics module. Counters are monotonic since process start; timings report total/count/max milliseconds observed over the current accumulator window.',
  idColumn: 'name',
  columns: [
    { name: 'name', type: 'string', description: 'Dot-namespaced metric name (e.g. router.inbound_total).' },
    { name: 'kind', type: 'string', description: 'Metric kind.', enum: ['counter', 'timing'] },
    { name: 'value', type: 'number', description: 'Counter value, or total milliseconds for timings.' },
    { name: 'count', type: 'number', description: 'Sample count (1 for counters).' },
    { name: 'max_value', type: 'number', description: 'Largest single sample for timings (0 for counters).' },
    { name: 'updated_at', type: 'string', description: 'Most recent flush timestamp.' },
  ],
  operations: { list: 'open', get: 'open' },
});
