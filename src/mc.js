// @flow

import ExtendableError from 'es6-error';
import fetch from 'isomorphic-fetch';

export class MCError extends ExtendableError {
  body: Object;

  constructor(message: string, body: Object) {
    super(message);
    this.body = body;
  }
}

export default async (username: string, password: string) => {
  const params = {
    agent: {
      name: 'Minecraft',
      version: 1,
    },
    username,
    password,
  };

  const res = await fetch('https://authserver.mojang.com/authenticate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const body: Object = await res.json();

  if (res.status < 200 && res.status >= 300) {
    throw new MCError(res.statusText, body);
  }

  if (body.error) throw new MCError(body.error, body);

  if (body.selectedProfile && body.selectedProfile.legacy) {
    throw new MCError('LegacyAccountError', {
      error: 'LegacyAccountError',
    });
  }

  return body;
};
