import * as dns from 'node:dns';
import * as net from 'node:net';

describe('worker network startup', () => {
  it('retains IPv4-first ordering and gives each family attempt one second', () => {
    const order = dns.getDefaultResultOrder();
    const timeout = net.getDefaultAutoSelectFamilyAttemptTimeout();
    const autoSelect = net.getDefaultAutoSelectFamily();
    try {
      net.setDefaultAutoSelectFamilyAttemptTimeout(250);
      jest.isolateModules(() => require('./network.defaults'));
      expect(dns.getDefaultResultOrder()).toBe('ipv4first');
      expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(1000);
      expect(net.getDefaultAutoSelectFamily()).toBe(autoSelect);
    } finally {
      dns.setDefaultResultOrder(order);
      net.setDefaultAutoSelectFamilyAttemptTimeout(timeout);
    }
  });

  it('preserves a longer operator-configured timeout', () => {
    const order = dns.getDefaultResultOrder();
    const timeout = net.getDefaultAutoSelectFamilyAttemptTimeout();
    try {
      net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
      jest.isolateModules(() => require('./network.defaults'));
      expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(5000);
    } finally {
      dns.setDefaultResultOrder(order);
      net.setDefaultAutoSelectFamilyAttemptTimeout(timeout);
    }
  });
});
