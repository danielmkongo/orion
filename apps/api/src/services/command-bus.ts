import { EventEmitter } from 'node:events';

/** Lightweight in-process bus for cross-service command delivery. */
export const commandBus = new EventEmitter();
commandBus.setMaxListeners(50);
