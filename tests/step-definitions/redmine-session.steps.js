'use strict';

// Session and project step definitions: logging in with the users registry, the login form and its refusal, logging
// out, who the session is, and a project an account may open or is refused.
//
// The other step files: redmine-issues.steps.js (the issue list, one issue, its status, notes, time and assignee, a
// new issue) and redmine-versions.steps.js (a version and its issues, the roadmap).
//
// Steps that webship-js already covers with its generic click, fill and see vocabulary are not duplicated here.
// Every assertion waits on its locator (the assertion is the wait), and every failure is a friendly error with a hint
// instead of a raw Playwright timeout stack.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  exactly,
  tidy,
  open,
  waitForValue,
  resolveUser,
  currentUser,
  currentName,
  dropSession,
  submitLogin,
  signInAs,
  siteUrl,
  findProject,
} = require('./redmine-helpers');

// ---------------------------------------------------------------------------
// Logging in (the first steps of the pack), then the rest of the session
// ---------------------------------------------------------------------------

/**
 * Log in with an account of the users registry in cucumber.js (`worldParameters.users`), by its handle, and make sure
 * the session is that account's. An account that is already logged in is kept. The first time in a run the account goes
 * through the login form; after that its session is put back, so switching accounts inside a scenario is quick.
 *
 * Example #1: Given I am a logged in user with the "member" user
 * Example #2: Given I am a logged in user with the "owner" user
 * Example #3: Given we are a logged in user with the "reader" user
 * Example #4: And I am a logged in user with the "stranger" user
 * Example #5: When I am a logged in user with the "member" user
 *
 */
Given(/^(I am|we are) a logged in user with the "([^"]*)" user$/, async function (pronounCase, handle) {
  await signInAs(this, handle);
});

/**
 * Log in through the form with the login and the password of an account of the users registry, without the checks of
 * "I am a logged in user with the … user": the step to use when the scenario is about the login itself. Follow it with
 * a step that says what should happen.
 *
 * Example #1: When I log in with the "member" user
 * Example #2: When I log in with the "owner" user
 * Example #3: When we log in with the "reader" user
 * Example #4: And I log in with the "stranger" user
 * Example #5: When log in with the "member" user
 *
 */
When(/^(I |we )*log in with the "([^"]*)" user$/, async function (pronounCase, handle) {
  const user = resolveUser(this, handle);
  await dropSession(this);
  await submitLogin(this, user.username, user.password);
});

/**
 * Fill in the login form with a login and a password as typed in the step, and submit it. It asserts nothing: follow
 * it with a step that says what should happen (logged in, or the login refused). For the accounts of the registry use
 * "I am a logged in user with the … user".
 *
 * Example #1: When I log in as "member" with the password "not-the-right-password"
 * Example #2: When I log in as "nobody" with the password "whatever"
 * Example #3: When we log in as "reader" with the password "wrong"
 * Example #4: And I log in as "owner" with the password "wrong-password"
 * Example #5: When I log in as "member" with the password ""
 *
 */
When(/^(I |we )*log in as "([^"]*)" with the password "([^"]*)"$/, async function (pronounCase, login, password) {
  await dropSession(this);
  await submitLogin(this, login, password);
});

/**
 * Make sure nobody is logged in: the browser forgets its session. (To end a session through the screens, use
 * "I log out".)
 *
 * Example #1: Given I am not logged in
 * Example #2: Given we are not logged in
 * Example #3: And I am not logged in
 * Example #4: When I am not logged in
 * Example #5: Given I am not logged in
 *
 */
Given(/^(I am|we are) not logged in$/, async function (pronounCase) {
  await dropSession(this);
});

/**
 * Log out through the site, the way its account menu does (its sign-out page and its button), and wait until the
 * session is a visitor's.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: And I log out
 * Example #4: Then I log out
 * Example #5: When log out
 *
 */
When(/^(I |we )*log out$/, async function (pronounCase) {
  await open(this, '/logout');
  const button = this.page.locator('form[action$="/logout"] [type="submit"]').first();
  if (await button.count()) await button.click();
  const result = await waitForValue(() => currentUser(this), (login) => login === '', budget(this));
  if (!result.ok) {
    throw friendly({ message: `Logging out did not end the session: it is still "${result.value}"'s.`, hint: 'The site logs out with the button of its sign-out page (/logout); a single sign-on provider may keep the session elsewhere.' });
  }
});

/**
 * Assert who the session is: the name the site shows for the account ("Member Test"), or its login ("member").
 *
 * Example #1: Then I should be logged in as "Member Test"
 * Example #2: Then I should be logged in as "member"
 * Example #3: Then we should be logged in as "Owner Test"
 * Example #4: And I should be logged in as "reader"
 * Example #5: Then should be logged in as "Stranger Test"
 *
 */
Then(/^(I |we )*should be logged in as "([^"]*)"$/, async function (pronounCase, who) {
  const result = await waitForValue(async () => [await currentUser(this), await currentName(this)], ([login, name]) => login === who || exactly(who).test(name), budget(this));
  if (!result.ok) {
    const [login, name] = result.value || ['', ''];
    throw friendly({
      message: login ? `Expected the session to be "${who}", but it is ${name} (login "${login}").` : `Expected the session to be "${who}", but nobody is logged in.`,
      hint: 'Log in first with Given I am a logged in user with the "…" user, or with the login form.',
    });
  }
});

/**
 * Assert that nobody is logged in: the session is a visitor's.
 *
 * Example #1: Then I should not be logged in
 * Example #2: Then we should not be logged in
 * Example #3: And I should not be logged in
 * Example #4: But I should not be logged in
 * Example #5: Then should not be logged in
 *
 */
Then(/^(I |we )*should not be logged in$/, async function (pronounCase) {
  const result = await waitForValue(() => currentUser(this), (login) => login === '', budget(this));
  if (!result.ok) {
    throw friendly({ message: `Expected nobody to be logged in, but the session is "${result.value}"'s.`, hint: 'A refused login keeps the visitor\'s session; a login that worked opens the account\'s.' });
  }
});

/**
 * Assert that the login form refused the last login with a message that holds the text (the site's error banner).
 * Give such a scenario @js-off: the browser logs the refused request.
 *
 * Example #1: Then the login should be refused with "Invalid user or password"
 * Example #2: Then the login should be refused with "Invalid user"
 * Example #3: And the login should be refused with "password"
 * Example #4: But the login should be refused with "Invalid user or password"
 * Example #5: Then the login should be refused with "Invalid user"
 *
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (text) {
  const banner = this.page.locator('#flash_error, .flash.error').filter({ hasText: text }).first();
  try {
    await banner.waitFor({ state: 'visible', timeout: budget(this) });
  } catch {
    const shown = tidy(await this.page.locator('.flash').first().innerText({ timeout: 1000 }).catch(() => ''));
    throw friendly({
      message: `Expected the login to be refused with "${text}", but ${shown ? `the page says "${shown}"` : 'the page shows no error'} (${this.page.url()}).`,
      hint: 'Use it right after "I log in as … with the password …". A login that worked shows no error.',
    });
  }
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Open the overview of a project, by its identifier ("webship-site") or its name ("Webship site").
 *
 * Example #1: When I open the project "webship-site"
 * Example #2: When I open the project "Webship site"
 * Example #3: And we open the project "webship-site"
 * Example #4: Given I open the project "webship-site"
 * Example #5: When open the project "Webship site"
 *
 */
When(/^(I |we )*open the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await findProject(this, which);
  this.redmine = Object.assign(this.redmine || {}, { project: project.identifier });
  await open(this, `/projects/${project.identifier}`);
});

/**
 * Assert that the session may not open a project: the site answers that it is not authorized (403), or "not found".
 * Give such a scenario @js-off: the browser logs the refused page.
 *
 * Example #1: Then I should be refused the project "webship-site"
 * Example #2: Then we should be refused the project "Webship site"
 * Example #3: And I should be refused the project "webship-site"
 * Example #4: But I should be refused the project "webship-site"
 * Example #5: Then should be refused the project "Webship site"
 *
 */
Then(/^(I |we )*should be refused the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await findProject(this, which);
  const response = await this.page.goto(siteUrl(this, `/projects/${project.identifier}`)).catch(() => null);
  const status = response ? response.status() : 0;
  if (status !== 404 && status !== 403) {
    throw friendly({
      message: `Expected the project ${project.name} to be refused, but the site answered ${status || 'nothing'} (${this.page.url()}).`,
      hint: 'A member of the project, a public project and an administrator may open it; log in as an account with no membership.',
    });
  }
});
