import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import DiscorseSSO from 'discourse-sso';
import ect from 'ect';
import express from 'express';
import path from 'path';
import sassMiddleware from 'node-sass-middleware';

import MC from './mc';

// Read secrets
const COOKIE_KEY = process.env.COOKIE_KEY || 'mc-discourse-sso-user';
const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET) throw new Error('Env var COOKIE_SECRET is empty');
const DISCOURSE_URL = process.env.DISCOURSE_URL;
if (!DISCOURSE_URL) throw new Error('Missing Discourse URL - please pass as DISCOURSE_URL');
const DISCOURSE_SSO_SECRET = process.env.DISCOURSE_SSO_SECRET;
if (!DISCOURSE_SSO_SECRET) throw new Error('Missing SSO secret - please pass as DISCOURSE_SSO_SECRET');

// Configure SSO
const sso = new DiscorseSSO(DISCOURSE_SSO_SECRET);

// Configure Express
const app = express();
const renderer = ect({
  root: __dirname + '/../views',
  watch: true,
});

app.set('view engine', 'ect');
app.engine('ect', renderer.render);
app.use(sassMiddleware({
  src: path.join(__dirname, '..', 'public', 'sass'),
  dest: path.join(__dirname, '..', 'public', 'css'),
  outputStyle: 'compressed',
  prefix: '/css',
}));
app.use(express.static(__dirname + '/../public'));
app.use(cookieParser(COOKIE_SECRET));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Middleware

app.use((req, res, next) => {
  const cookie = req.signedCookies[COOKIE_KEY];
  const flash = req.signedCookies[COOKIE_KEY + '-flash'];

  res.setFlash = (message) => res.cookie(COOKIE_KEY + '-flash', message, { signed: true });
  req.flash = () => '';

  if (flash) {
    req.flash = () => {
      res.clearCookie(COOKIE_KEY + '-flash');
      return flash;
    };
  }

  if (!cookie) {
    req.auth = { isAuthenticated: false };
    return next();
  }

  const user = JSON.parse(cookie);
  req.auth = {
    isAuthenticated: true,
    user: user,
  };

  next();
});

// Routes

app.get('/', (req, res) => res.render('index', { auth: req.auth, flash: req.flash() }));

app.get('/discourse/sso', (req, res) => {
  const payload = req.query.sso;
  const sig = req.query.sig;

  if (!sso.validate(payload, sig)) {
    res.setFlash('SSO request was invalid!');
    return res.redirect('/');
  }

  if (!req.auth.isAuthenticated) {
    res.cookie(`${COOKIE_KEY}-redirect`, req.originalUrl, {
      signed: true,
      maxAge: 600000, // 10 minutes
    });
    res.setFlash('Please login with your Minecraft account:');
    return res.redirect('/');
  }

  const nonce = sso.getNonce(payload);
  const username = req.auth.user.username;
  const params = {
    nonce,
    external_id: req.auth.user.id,
    email: req.auth.user.email,
    username: username,
    avatar_url: `https://tntup.me/avatar/${username}/240.png`,
    avatar_force_update: true,
  };
  const query = sso.buildLoginString(params);

  res.redirect(`${DISCOURSE_URL}/session/sso_login?${query}`);
});

app.get('/login', (req, res) => res.redirect('/'));
app.get('/logout', (req, res) => res.redirect('/'));

app.post('/login', (req, res) => {
  const username = req.body.email;
  const password = req.body.password;

  MC.authenticate(username, password).then(data => {
    if (data.accessToken) {
      const user = {
        token: data.accessToken,
        username: data.selectedProfile.name,
        id: data.selectedProfile.id,
        email: username,
      };

      res.cookie(COOKIE_KEY, JSON.stringify(user), { signed: true });

      const redirect = req.signedCookies[`${COOKIE_KEY}-redirect`];
      if (redirect) {
        res.clearCookie(`${COOKIE_KEY}-redirect`);
        res.redirect(redirect);
      }
    }
    res.redirect('/');
  }).catch(err => {
    if (err.cause === 'UserMigratedException') {
      res.setFlash('You entered your Minecraft username - you should enter your Minecraft <i>email address</i> associated with your account.');
    } else if (err.error === 'ForbiddenOperationException') {
      res.setFlash('Invalid username or password.');
    } else if (err.error === 'LegacyAccountError') {
      res.setFlash('You have a legacy account - please <a href="https://account.mojang.com/migrate">migrate your account</a> at Mojang.');
    } else {
      res.setFlash('There was an error logging you in.');
    }
    res.redirect('/');
  });
});

app.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_KEY);
  res.redirect('/');
});

// Start the server

const server = app.listen(process.env.PORT || 3000, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log('mc-discourse-sso listening at http://%s:%s', host, port);
});
