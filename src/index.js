// @flow

import 'source-map-support/register';

import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import DiscorseSSO from 'discourse-sso';
import ect from 'ect';
import express from 'express';
import path from 'path';
import sassMiddleware from 'node-sass-middleware';

import context from './context';
import authenticate from './mc';

// Custom request type

declare class AuthedRequest extends express$Request {
  flash: Function;
}

// Read secrets

const COOKIE_KEY: string = process.env.COOKIE_KEY || 'mc-discourse-sso-user';

const COOKIE_SECRET: ?string = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET) throw new Error('Env var COOKIE_SECRET is empty');

const DISCOURSE_URL: ?string = process.env.DISCOURSE_URL;
if (!DISCOURSE_URL) throw new Error('Missing Discourse URL - please pass as DISCOURSE_URL');
const DISCOURSE_SSO_SECRET: ?string = process.env.DISCOURSE_SSO_SECRET;

if (!DISCOURSE_SSO_SECRET) throw new Error('Missing SSO secret - please pass as DISCOURSE_SSO_SECRET');

// Configure SSO

const sso = new DiscorseSSO(DISCOURSE_SSO_SECRET);

// Configure Express

const app = express();
const renderer = ect({
  root: path.join(__dirname, '..', 'views'),
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
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cookieParser(COOKIE_SECRET));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Middleware

app.use((
  req: express$Request,
  res: express$Response,
  next: express$NextFunction,
) => {
  const ctx = context.get(req);
  const cookie = req.signedCookies[COOKIE_KEY];
  const flash = req.signedCookies[`${COOKIE_KEY}-flash`];

  ctx.setFlash = (message: string) => res.cookie(`${COOKIE_KEY}-flash`, message, { signed: true });
  ctx.flash = () => '';

  if (flash) {
    ctx.flash = () => {
      res.clearCookie(`${COOKIE_KEY}-flash`);
      return flash;
    };
  }

  if (!cookie) {
    ctx.auth = { isAuthenticated: false };
    return next();
  }

  const user: Object = JSON.parse(cookie);
  ctx.auth = {
    isAuthenticated: true,
    user,
  };

  return next();
});

// Routes

app.get('/', (req: express$Request, res: express$Response, next: express$NextFunction) => {
  const ctx = context.get(req);
  res.render('index', { auth: ctx.auth, flash: ctx.flash() });
  next();
});

app.get('/discourse/sso', (req: express$Request, res: express$Response, next: express$NextFunction) => {
  const ctx = context.get(req);
  const payload = req.query.sso;
  const sig = req.query.sig;

  if (!sso.validate(payload, sig)) {
    ctx.setFlash('SSO request was invalid!');
    res.redirect('/');
    return next();
  }

  if (!ctx.auth.isAuthenticated) {
    res.cookie(`${COOKIE_KEY}-redirect`, req.originalUrl, {
      signed: true,
      maxAge: 600000, // 10 minutes
    });
    ctx.setFlash('Please login with your Minecraft account:');
    res.redirect('/');
    return next();
  }

  const nonce: string = sso.getNonce(payload);
  const username: string = ctx.auth.user.username;
  const params = {
    nonce,
    external_id: ctx.auth.user.id,
    email: ctx.auth.user.email,
    username,
    avatar_url: `https://crafatar.com/avatars/${ctx.auth.user.id}?size=240&overlay=true`,
    avatar_force_update: true,
  };
  const query = sso.buildLoginString(params);

  res.redirect(`${DISCOURSE_URL}/session/sso_login?${query}`);
  return next();
});

app.get('/login', (req: express$Request, res: express$Response, next: express$NextFunction) => {
  res.redirect('/');
  next();
});
app.get('/logout', (req: express$Request, res: express$Response, next: express$NextFunction) => {
  res.redirect('/');
  next();
});

app.post('/login', async (req: express$Request, res: express$Response, next: express$NextFunction) => {
  const ctx = context.get(req);
  const username: string = req.body.email;
  const password: string = req.body.password;

  try {
    const data = await authenticate(username, password);
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
      } else {
        res.redirect('/');
      }
    }
  } catch (err) {
    if (err.cause === 'UserMigratedException') {
      ctx.setFlash('You entered your Minecraft username - you should enter your Minecraft <i>email address</i> associated with your account.');
    } else if (err.error === 'ForbiddenOperationException') {
      ctx.setFlash('Invalid username or password.');
    } else if (err.error === 'LegacyAccountError') {
      ctx.setFlash('You have a legacy account - please <a href="https://account.mojang.com/migrate">migrate your account</a> at Mojang.');
    } else {
      ctx.setFlash('There was an error logging you in.');
    }
    res.redirect('/');
  } finally {
    next();
  }
});

app.post('/logout', (req: express$Request, res: express$Response, next: express$NextFunction) => {
  res.clearCookie(COOKIE_KEY);
  res.redirect('/');
  next();
});

app.use((req: express$Request, res: express$Response, next: express$NextFunction) => {
  context.clear(req);
  next();
});

app.use((err: ?Error, req: express$Request, res: express$Response, next: express$NextFunction) => {
  context.clear(req);
  if (err) console.error(err.stack);
  next();
});

// Start the server

const server: Server = app.listen(process.env.PORT || 3000, () => {
  const host: string = server.address().address;
  const port: string = server.address().port;

  console.log('mc-discourse-sso listening at http://%s:%s', host, port);
});
