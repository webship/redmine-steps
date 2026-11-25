'use strict';

// Version step definitions: a version of a project (its page, the issues it holds and its state) and the roadmap of
// the project. They only read: an issue moves into a version through the site, not here.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const { budget, exactly, tidy, open, assertPresence, findProject, api, apiFailure } = require('./redmine-helpers');

/**
 * Open the page of a version of a project, by its name: what it holds and its state.
 *
 * Example #1: When I open the version "Sprint 1" of the project "webship-site"
 * Example #2: When I open the version "Sprint 1" of the project "Webship site"
 * Example #3: And we open the version "Sprint 1" of the project "webship-site"
 * Example #4: Given I open the version "Sprint 2" of the project "webship-site"
 * Example #5: When open the version "Sprint 1" of the project "Webship site"
 *
 */
When(/^(I |we )*open the version "([^"]*)" of the project "([^"]*)"$/, async function (pronounCase, name, which) {
  const project = await findProject(this, which);
  this.redmine = Object.assign(this.redmine || {}, { project: project.identifier });
  const r = await api(this, 'GET', `/projects/${project.identifier}/versions.json`);
  if (r.status !== 200) throw apiFailure(`read the versions of ${project.name}`, r, 'The managing account must see the project\'s versions.');
  const version = ((r.data && r.data.versions) || []).find((v) => exactly(name).test(v.name));
  if (!version) throw friendly({ message: `${project.name} has no version "${name}".`, hint: 'The versions are in the project\'s settings (Versions) and on its roadmap.' });
  await open(this, `/versions/${version.id}`);
});

/**
 * Assert that the version on screen lists (or does not list) an issue, by its subject.
 *
 * Example #1: Then the version should list the issue "The greeting script says Helo instead of Hello"
 * Example #2: Then the version should not list the issue "The usage page spells greeting as greting"
 * Example #3: And the version should list the issue "Webship test task"
 * Example #4: But the version should not list the issue "Webship test task"
 * Example #5: Then the version should list the issue "The greeting script says Helo instead of Hello"
 *
 */
Then(/^the version should (not )?list the issue "([^"]*)"$/, async function (notCase, subject) {
  await assertPresence(this.page.locator('h2').first(), null, { label: 'a version', hint: 'Open one first with When I open the version "…" of the project "…".', timeout: budget(this) });
  await assertPresence(this.page.locator('table.related-issues tr.issue').filter({ hasText: subject }), notCase, {
    label: `the issue "${subject}" in the version`,
    hint: notCase ? 'An issue leaves a version when its target version changes.' : 'An issue is in a version when its Target version names it.',
    timeout: budget(this),
  });
});

/**
 * Assert the state the version on screen shows ("open", "locked", "closed").
 *
 * Example #1: Then the version should be "open"
 * Example #2: Then the version should be "closed"
 * Example #3: And the version should be "locked"
 * Example #4: But the version should be "open"
 * Example #5: Then the version should be "open"
 *
 */
Then(/^the version should be "([^"]*)"$/, async function (state) {
  const badge = this.page.locator('#content .badge[class*="badge-status-"]').first();
  await assertPresence(badge, null, { label: 'the state of the version', hint: 'Open the version first with When I open the version "…" of the project "…".', timeout: budget(this) });
  // Its text, not as the page draws it: the badge is set in capitals.
  const shown = tidy(await badge.textContent());
  if (!exactly(state).test(shown)) throw friendly({ message: `Expected the version to be "${state}", but it shows "${shown}".`, hint: 'A version is open, locked or closed.' });
});

/**
 * Open the roadmap of a project: its open versions.
 *
 * Example #1: When I open the roadmap of the project "webship-site"
 * Example #2: When I open the roadmap of the project "Webship site"
 * Example #3: And we open the roadmap of the project "webship-site"
 * Example #4: Given I open the roadmap of the project "webship-site"
 * Example #5: When open the roadmap of the project "Webship site"
 *
 */
When(/^(I |we )*open the roadmap of the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await findProject(this, which);
  this.redmine = Object.assign(this.redmine || {}, { project: project.identifier });
  await open(this, `/projects/${project.identifier}/roadmap`);
});

/**
 * Assert that the roadmap on screen lists (or does not list) a version, by its name.
 *
 * Example #1: Then the roadmap should list the version "Sprint 1"
 * Example #2: Then the roadmap should not list the version "Sprint 0"
 * Example #3: And the roadmap should list the version "Sprint 1"
 * Example #4: But the roadmap should not list the version "Webship test version"
 * Example #5: Then the roadmap should list the version "Sprint 1"
 *
 */
Then(/^the roadmap should (not )?list the version "([^"]*)"$/, async function (notCase, name) {
  await assertPresence(this.page.locator('article.version-article h3 a').filter({ hasText: exactly(name) }), notCase, {
    label: `the version "${name}" on the roadmap`,
    hint: notCase ? 'A completed or closed version leaves the roadmap (unless its completed versions are shown).' : 'The roadmap lists the project\'s open versions; open it first with When I open the roadmap of the project "…".',
    timeout: budget(this),
  });
});
