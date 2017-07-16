# mc-discourse-sso [![Dependency Status](https://gemnasium.com/the-obsidian/mc-discourse-sso.svg)](https://gemnasium.com/the-obsidian/mc-discourse-sso) [![Build Status](https://travis-ci.org/the-obsidian/mc-discourse-sso.svg)](https://travis-ci.org/the-obsidian/mc-discourse-sso) [![NPM version](https://badge.fury.io/js/mc-discourse-sso.svg)](https://www.npmjs.com/package/mc-discourse-sso)

Allows users to login to Discourse with their Minecraft account.

## Configuration

* `DISCOURSE_URL` - URL of your Discourse forum (the full URL without the trailing slash, like `http://forum.example.com`)
* `DISCOURSE_SSO_SECRET` - your SSO secret
* `COOKIE_SECRET` - your session cookie secret (anything random, like perhaps a 128 character random hex string)
* `PORT` - the port to run the server

## Running

```shell
$ npm start
```

## License

Copyright (c) 2015-2017 Jacob Gillespie.  MIT license.  See `LICENSE`.
