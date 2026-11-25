'use strict';

// Shared helpers for the step files of this pack.
//
// Not a step file: it registers no step definitions and no hooks. It holds the plumbing the steps use and that
// another pack can require instead of copying: the wait budget, presence assertions with friendly errors, URL
// building, the users registry, signing in (the form, and a session put back), the site's REST API as the managing
// account (the test content a scenario makes and removes), and the issues a scenario made, which go after it.
//
// Everything here builds on webship-js's own helpers (`gotoUrl`, `smartSettle`, `waitForPageLoad`, `friendly`) so the
// steps behave like the core webship-js steps.

const { gotoUrl, smartSettle, waitForPageLoad, friendly } = require('webship-js/tests/step-definitions/webship');

let playwright;
try { playwright = require('playwright'); } catch { playwright = require(require.resolve('playwright', { paths: [require.resolve('webship-js/package.json')] })); }

/**
 * The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 10 seconds, so a slow page does not fail
 * an assertion that would pass a moment later. Kept below webship-js's 45 second step timeout.
 *
 * @param {object} world
 * @returns {number}
 */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 10000);
}

/**
 * Escape a literal string for use in a RegExp.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A RegExp that matches the whole text (ignoring surrounding space and case), for exact names and labels.
 *
 * @param {string} text
 * @returns {RegExp}
 */
function exactly(text) {
  return new RegExp('^\\s*' + escapeRegExp(text) + '\\s*$', 'i');
}

/**
 * Collapse runs of white space and trim.
 *
 * @param {string} text
 * @returns {string}
 */
function tidy(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\s+/g, ' ').trim();
}

/**
 * Run an action and rethrow its failure as a friendly error (action, target, cause and a hint) instead of
 * Playwright's raw timeout stack.
 *
 * @param {string} label
 * @param {string} target
 * @param {Function} fn
 * @param {string} hint
 */
async function actOrExplain(label, target, fn, hint) {
  try {
    return await fn();
  } catch (err) {
    if (err && err.stack === err.message && /Hint:/.test(err.message)) throw err;
    throw friendly({ action: label, target, cause: err, hint });
  }
}

/**
 * Wait until a locator has (or, with `notCase`, no longer has) a visible match and fail with a friendly error
 * otherwise: the wait and the assertion are one call, so content that arrives a moment late still passes.
 *
 * @param {import('playwright').Locator} locator
 * @param {string|null|undefined} notCase
 * @param {{label: string, hint: string, timeout: number}} options
 */
async function assertPresence(locator, notCase, { label, hint, timeout }) {
  try {
    await locator.first().waitFor({ state: notCase ? 'hidden' : 'visible', timeout });
  } catch {
    throw friendly({
      message: notCase ? `Expected not to see ${label}, but it is still on the page.` : `Expected to see ${label}, but it did not appear within ${timeout} ms.`,
      hint,
    });
  }
}

/**
 * Poll a reader until its value satisfies a test, and return the last value read, so a value that changes a moment
 * after the action (a status after a move) still passes.
 *
 * @param {Function} read - async () => value
 * @param {Function} test - (value) => boolean
 * @param {number} timeout
 * @returns {Promise<{ok: boolean, value: *}>}
 */
async function waitForValue(read, test, timeout) {
  const deadline = Date.now() + timeout;
  let value;
  for (;;) {
    try { value = await read(); } catch { value = undefined; }
    if (value !== undefined && test(value)) return { ok: true, value };
    if (Date.now() >= deadline) return { ok: false, value };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * The site root without a trailing slash.
 *
 * @param {object} world
 * @returns {string}
 */
function siteRoot(world) {
  return String(world.launchUrl).replace(/\/+$/, '');
}

/**
 * Join the site root and a path with exactly one slash. Absolute URLs pass through.
 *
 * @param {object} world
 * @param {string} url
 * @returns {string}
 */
function siteUrl(world, url) {
  if (!url) return siteRoot(world);
  if (/^https?:\/\//i.test(url)) return url;
  return siteRoot(world) + '/' + String(url).replace(/^\/+/, '');
}

/**
 * Open a page of the site and wait for it to settle.
 *
 * @param {object} world
 * @param {string} url
 */
async function open(world, url) {
  await gotoUrl(world.page, siteUrl(world, url));
  await world.page.waitForSelector('body', { state: 'attached', timeout: budget(world) });
  await waitForPageLoad(world.page, (world.minWaitTime && world.minWaitTime.page) || 3000);
}

/**
 * A user of the `users` registry in cucumber.js (`worldParameters.users`).
 *
 * @param {object} world
 * @param {string} handle
 * @returns {{username: string, password: string, name: string}}
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The account "${handle}" is not in the users registry. Known accounts: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: '...', password: process.env.REDMINE_${handle.toUpperCase()}_PASSWORD, name: '...' } }. The account itself is made once by the build of the site, never by a feature.`,
    });
  }
  const username = entry.username || handle;
  const password = typeof entry === 'string' ? entry : entry.password;
  if (!password) {
    throw friendly({
      message: `The account "${handle}" has no password in the users registry.`,
      hint: `Set worldParameters.users.${handle}.password in cucumber.js, from an environment variable.`,
    });
  }
  return { username, password, name: entry.name || '' };
}

/**
 * The login of the account the browser's session is of, read from the site's own account menu (its first link to the
 * account, which carries the login); an empty string for a visitor.
 *
 * @param {object} world
 * @returns {Promise<string>}
 */
async function currentUser(world) {
  const r = await world.context.request.get(siteUrl(world, '/my/account'), { ignoreHTTPSErrors: true, failOnStatusCode: false, maxRedirects: 0 }).catch(() => null);
  if (!r || r.status() !== 200) return '';
  const html = await r.text().catch(() => '');
  const m = html.match(/<a class="user active" href="[^"]*">([^<]+)<\/a>/);
  return m ? m[1].trim() : '';
}

/**
 * The name the site shows for the account the browser's session is of (its first and last name, from its own account
 * page); an empty string for a visitor.
 *
 * @param {object} world
 * @returns {Promise<string>}
 */
async function currentName(world) {
  const r = await world.context.request.get(siteUrl(world, '/my/account'), { ignoreHTTPSErrors: true, failOnStatusCode: false, maxRedirects: 0 }).catch(() => null);
  if (!r || r.status() !== 200) return '';
  const html = await r.text().catch(() => '');
  const field = (id) => {
    const tag = (html.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`)) || [''])[0];
    return (tag.match(/\bvalue="([^"]*)"/) || ['', ''])[1];
  };
  return tidy(`${field('user_firstname')} ${field('user_lastname')}`);
}

/**
 * Forget the browser's session: the page is emptied first, so no request of the site brings a new session back.
 *
 * @param {object} world
 */
async function dropSession(world) {
  if (world.page.url() !== 'about:blank') await world.page.goto('about:blank').catch(() => {});
  await world.context.clearCookies();
}

/**
 * Fill and submit the login form with a login and a password. It asserts nothing.
 *
 * @param {object} world
 * @param {string} username
 * @param {string} password
 */
async function submitLogin(world, username, password) {
  const page = world.page;
  await open(world, '/login');
  await actOrExplain('fill in the login form for', username, async () => {
    const form = page.locator('form:has(#username):has(#password)').last();
    await form.locator('#username').waitFor({ state: 'visible', timeout: budget(world) });
    await form.locator('#username').fill(username);
    await form.locator('#password').fill(password);
    await form.locator('[type="submit"]').first().click();
  }, 'The login form (#username, #password and its submit button) did not show at /login. A site that signs in through another provider only has no such form, and a session that is already open is sent to its home page instead.');
  await smartSettle(page, 2000);
}

const sessions = new Map();

/**
 * Sign in with an account of the users registry and make sure the session is that account's. An account that is
 * already signed in is kept; an account that signed in earlier in the run gets its session back; otherwise the account
 * goes through the login form.
 *
 * @param {object} world
 * @param {string} handle
 */
async function signInAs(world, handle) {
  const user = resolveUser(world, handle);
  const key = siteRoot(world) + '|' + handle;
  if ((await currentUser(world)) === user.username) {
    if (world.page.url() === 'about:blank' || !world.page.url().startsWith(siteRoot(world))) await open(world, '/my/page');
    return;
  }
  await dropSession(world);
  const saved = sessions.get(key);
  if (saved) {
    await world.context.addCookies(saved);
    if ((await currentUser(world)) === user.username) {
      await open(world, '/my/page');
      return;
    }
    sessions.delete(key);
    await dropSession(world);
  }
  await submitLogin(world, user.username, user.password);
  const result = await waitForValue(() => currentUser(world), (login) => login === user.username, budget(world));
  if (!result.ok) {
    const error = tidy(await world.page.locator('#flash_error, .flash.error').first().innerText({ timeout: 1500 }).catch(() => ''));
    throw friendly({
      message: `Logging in as "${handle}" (login "${user.username}") did not work${error ? `: the site says "${error}"` : `; the page is ${world.page.url()}`}.`,
      hint: 'Check the login and the password of this account in worldParameters.users of cucumber.js, and that the account exists on the site and is not locked.',
    });
  }
  sessions.set(key, await world.context.cookies());
}

// ---------------------------------------------------------------------------
// The site's REST API, as the managing account
// ---------------------------------------------------------------------------

const managers = new Map();

/** The managing accounts' request contexts of a run, all of them, and their end. */
const managerContexts = {
  async dispose() {
    for (const ctx of managers.values()) await ctx.dispose().catch(() => {});
    managers.clear();
  },
};

/**
 * A request context of its own for the managing account (`worldParameters.manager`, a handle of the users registry),
 * for the test content a scenario makes and removes: the REST API with the account's login and password (HTTP Basic,
 * which Redmine takes once its REST API is on). It never touches the browser's session.
 *
 * @param {object} world
 * @returns {Promise<import('playwright').APIRequestContext>}
 */
async function managerContext(world) {
  const handle = (world.parameters && world.parameters.manager) || 'owner';
  const key = siteRoot(world) + '|' + handle;
  if (managers.has(key)) return managers.get(key);
  const user = resolveUser(world, handle);
  const ctx = await playwright.request.newContext({
    baseURL: siteRoot(world), ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Authorization: 'Basic ' + Buffer.from(`${user.username}:${user.password}`).toString('base64'), Accept: 'application/json' },
  });
  const me = await ctx.get('/users/current.json', { failOnStatusCode: false });
  const login = me.status() === 200 ? String(((await me.json()).user || {}).login || '') : '';
  if (login !== user.username) {
    await ctx.dispose();
    throw friendly({
      message: `The managing account "${handle}" could not use the REST API of ${siteRoot(world)} for the test content (it answered ${me.status()}).`,
      hint: 'The REST API must be on (Administration → Settings → API, as the Workspace\'s builder leaves it); check worldParameters.manager and the account in worldParameters.users of cucumber.js.',
    });
  }
  managers.set(key, ctx);
  return ctx;
}

/**
 * One call of the REST API as the managing account: its status and its JSON.
 *
 * @param {object} world
 * @param {string} method
 * @param {string} path - a .json path of the site
 * @param {object} [data]
 * @returns {Promise<{status: number, data: *}>}
 */
async function api(world, method, path, data) {
  const ctx = await managerContext(world);
  const r = await ctx.fetch(path, {
    method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    data: data === undefined ? undefined : JSON.stringify(data),
    failOnStatusCode: false,
  });
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status(), data: body };
}

/**
 * An answer of the API that is not a success, as a friendly error.
 *
 * @param {string} what
 * @param {{status: number, data: *}} r
 * @param {string} hint
 */
function apiFailure(what, r, hint) {
  const errors = r.data && Array.isArray(r.data.errors) ? ` (${r.data.errors.join('; ')})` : '';
  return friendly({ message: `Could not ${what}: the site answered ${r.status}${errors}.`, hint });
}

/**
 * A project by its identifier or its name: { id, identifier, name }. The step's project, else the one of cucumber.js.
 *
 * @param {object} world
 * @param {string} [which]
 */
async function findProject(world, which) {
  const wanted = String(which || (world.parameters && world.parameters.project) || '').trim();
  const direct = /^[a-z][a-z0-9_-]*$/.test(wanted) ? await api(world, 'GET', `/projects/${encodeURIComponent(wanted)}.json`) : { status: 0 };
  if (direct.status === 200) return { id: direct.data.project.id, identifier: direct.data.project.identifier, name: direct.data.project.name };
  const all = await api(world, 'GET', '/projects.json?limit=100');
  const found = ((all.data && all.data.projects) || []).find((p) => exactly(wanted).test(p.name) || p.identifier === wanted);
  if (!found) throw friendly({ message: `There is no project "${wanted}" the managing account can see.`, hint: 'Name the project by its identifier (webship-site) or its name (Webship site); the managing account must be a member of it.' });
  return { id: found.id, identifier: found.identifier, name: found.name };
}

/**
 * The issues of a project whose subject is the text, open or closed.
 *
 * @param {object} world
 * @param {{id: number}} project
 * @param {string} subject
 * @returns {Promise<object[]>}
 */
async function findIssues(world, project, subject) {
  const q = new URLSearchParams({ project_id: String(project.id), status_id: '*', subject: `~${subject}`, limit: '100' });
  const r = await api(world, 'GET', `/issues.json?${q.toString()}`);
  if (r.status !== 200) throw apiFailure(`look for the issue "${subject}"`, r, 'The managing account must see the project\'s issues.');
  return ((r.data && r.data.issues) || []).filter((i) => exactly(subject).test(i.subject));
}

/**
 * The one issue of a subject in a project (the step's, else the last one a scenario used).
 *
 * @param {object} world
 * @param {string} subject
 * @param {string} [projectName]
 * @returns {Promise<object>}
 */
async function issueNamed(world, subject, projectName) {
  const project = await findProject(world, projectName || (world.redmine && world.redmine.project));
  const found = await findIssues(world, project, subject);
  if (!found.length) throw friendly({ message: `There is no issue "${subject}" in the project ${project.name}.`, hint: 'Make it first with Given there is an issue "…" in the project "…".' });
  return found[0];
}

/**
 * Remember an issue a scenario made, so it goes after the scenario.
 *
 * @param {object} world
 * @param {number|string} id
 */
function remember(world, id) {
  world.redmine = world.redmine || {};
  world.redmine.made = world.redmine.made || new Set();
  world.redmine.made.add(String(id));
}

/**
 * Remove an issue, as the managing account: Redmine removes its notes and the time spent on it with it.
 *
 * @param {object} world
 * @param {number|string} id
 */
async function removeIssue(world, id) {
  const r = await api(world, 'DELETE', `/issues/${id}.json`);
  if (r.status !== 204 && r.status !== 200 && r.status !== 404) throw apiFailure(`remove the issue #${id}`, r, 'The managing account must be allowed to delete issues in the project (a Manager).');
}

/**
 * Make an issue as the managing account: the project's first tracker, its default status.
 *
 * @param {object} world
 * @param {{id: number}} project
 * @param {string} subject
 * @returns {Promise<object>}
 */
async function makeIssue(world, project, subject) {
  const r = await api(world, 'POST', '/issues.json', { issue: { project_id: project.id, subject, description: 'Made by a test scenario; it goes after the scenario.' } });
  if (r.status !== 201) throw apiFailure(`make the issue "${subject}"`, r, 'The managing account must be allowed to add issues in the project.');
  remember(world, r.data.issue.id);
  return r.data.issue;
}

module.exports = {
  budget,
  escapeRegExp,
  exactly,
  tidy,
  actOrExplain,
  assertPresence,
  waitForValue,
  siteRoot,
  siteUrl,
  open,
  resolveUser,
  currentUser,
  currentName,
  dropSession,
  submitLogin,
  signInAs,
  managerContext,
  managerContexts,
  api,
  apiFailure,
  findProject,
  findIssues,
  issueNamed,
  remember,
  removeIssue,
  makeIssue,
};
