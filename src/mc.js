import request from 'request';

export default class MC {
  static authenticate(username, password) {
    return new Promise((resolve, reject) => {
      const params = {
        agent: {
          name: 'Minecraft',
          version: 1,
        },
        username,
        password,
      };

      request({
        method: 'POST',
        uri: 'https://authserver.mojang.com/authenticate',
        body: params,
        json: true,
      }, (err, res) => {
        if (err) return reject(err.response.body);
        if (res.body.error) return reject(res.body);
        if (res.body.selectedProfile && res.body.selectedProfile.legacy) {
          return reject({
            error: 'LegacyAccountError',
          });
        }

        resolve(res.body);
      });
    });
  }
}
