// mapGreenApiDeliveryStatus is the one place GreenAPI's own vocabulary for
// outgoingMessageStatus.status gets translated into our three honest states.
// Plain assertions, no mocking: the whole point of pulling this out of the
// webhook handler was to make it testable without a request or a database.
import assert from 'node:assert/strict';
import { mapGreenApiDeliveryStatus } from './lib/greenApi/deliveryStatus.ts';

assert.equal(mapGreenApiDeliveryStatus('delivered'), 'delivered');
assert.equal(mapGreenApiDeliveryStatus('read'), 'read');
assert.equal(mapGreenApiDeliveryStatus('DELIVERED'), 'delivered', 'case-insensitive');
assert.equal(mapGreenApiDeliveryStatus(' read '), 'read', 'trims whitespace');

assert.equal(mapGreenApiDeliveryStatus('failed'), 'undelivered');
assert.equal(mapGreenApiDeliveryStatus('notdelivered'), 'undelivered');
assert.equal(mapGreenApiDeliveryStatus('noaccount'), 'undelivered');
assert.equal(mapGreenApiDeliveryStatus('blocked'), 'undelivered');

// "sent" is GreenAPI's own acceptance status - the exact thing this whole fix
// exists to stop treating as delivery. Deliberately unmapped: null, not "sent".
assert.equal(mapGreenApiDeliveryStatus('sent'), null);
assert.equal(mapGreenApiDeliveryStatus('queued'), null);
assert.equal(mapGreenApiDeliveryStatus(undefined), null);
assert.equal(mapGreenApiDeliveryStatus(null), null);
assert.equal(mapGreenApiDeliveryStatus(''), null);
assert.equal(mapGreenApiDeliveryStatus(123), null);

console.log('greenapi delivery status: ok');
