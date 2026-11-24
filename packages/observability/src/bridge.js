/**
 * Connect an Ametherian event hub (from ametherian-core) to a logger,
 * metrics, and Node's diagnostics_channel so APM tools can subscribe.
 */
import diagnostics from 'node:diagnostics_channel';

/**
 * Log every hub event and count it in `ametherian_events_total{event}`.
 * Events whose payload has `error` are logged at warn, others at debug.
 * @param {{ onAny: Function }} hub
 * @param {{ logger?: object, metrics?: object }} targets
 * @returns {() => void} detach
 */
export function attachEventHub(hub, targets = {}) {
  const counter = targets.metrics?.counter('ametherian_events_total', 'Events emitted by Ametherian packages');
  return hub.onAny((name, payload) => {
    counter?.inc({ event: name });
    if (targets.logger) {
      const level = payload && payload.error ? 'warn' : 'debug';
      targets.logger[level](name, payload);
    }
  });
}

/**
 * Publish hub events on diagnostics_channel `${prefix}${eventName}`.
 * Publishing is skipped when the channel has no subscribers.
 * @param {{ onAny: Function }} hub
 * @param {string} [prefix]
 */
export function publishToDiagnosticsChannel(hub, prefix = 'ametherian:') {
  const channels = new Map();
  return hub.onAny((name, payload) => {
    let ch = channels.get(name);
    if (!ch) channels.set(name, (ch = diagnostics.channel(`${prefix}${name}`)));
    if (ch.hasSubscribers) ch.publish(payload);
  });
}
